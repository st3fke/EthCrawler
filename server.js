require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const path = require('path');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Configure EJS as view engine
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Environment validation
if (!process.env.INFURA_API_KEY || !process.env.ETHERSCAN_API_KEY || !process.env.PORT) {
  console.error('Missing required environment variables: INFURA_API_KEY, ETHERSCAN_API_KEY, PORT');
  process.exit(1);
}

// Initialize Ethereum provider with error handling
let provider;
try {
  provider = new ethers.InfuraProvider('homestead', process.env.INFURA_API_KEY);
} catch (error) {
  console.error('Failed to initialize Ethereum provider:', error);
  process.exit(1);
}

// Token addresses and information
const POPULAR_TOKENS = [
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6
  },
  {
    symbol: 'USDC', 
    name: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 
    decimals: 6
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    decimals: 18
  },
  {
    symbol: 'UNI',
    name: 'Uniswap',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    decimals: 18
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    decimals: 18
  }
];

// ERC-20 ABI for balanceOf function
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

// Create axios instance with timeout
const axiosInstance = axios.create({
  timeout: process.env.REQUEST_TIMEOUT,
  headers: {
    'User-Agent': 'Ethereum-Wallet-Explorer/1.0'
  }
});

// Input validation helpers
function validateEthereumAddress(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Address is required' };
  }
  
  if (!ethers.isAddress(address)) {
    return { valid: false, error: 'Invalid Ethereum address format' };
  }
  
  return { valid: true };
}

function validateBlockNumber(blockNumber, currentBlock) {
  const num = parseInt(blockNumber);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Block number must be a valid number' };
  }
  
  if (num < 0) {
    return { valid: false, error: 'Block number cannot be negative' };
  }
  
  if (num > currentBlock) {
    return { valid: false, error: 'Block number cannot be in the future' };
  }
  
  return { valid: true, value: num };
}

function validateDate(dateString) {
  if (!dateString) {
    return { valid: false, error: 'Date is required' };
  }
  
  const date = new Date(dateString);
  const now = new Date();
  
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }
  
  if (date > now) {
    return { valid: false, error: 'Cannot check balance for future dates' };
  }
  
  // Don't allow dates too far in the past (before Ethereum genesis)
  const ethereumGenesis = new Date('2015-07-30');
  if (date < ethereumGenesis) {
    return { valid: false, error: 'Date cannot be before Ethereum genesis block' };
  }
  
  return { valid: true, value: date };
}

// Home route - display form
app.get('/', (req, res) => {
  res.render('index', { error: null });
});

// Enhanced error handling wrapper
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Helper function to get ETH price with caching
let ethPriceCache = { price: null, timestamp: 0 };
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getEthPrice() {
  try {
    const now = Date.now();
    if (ethPriceCache.price && (now - ethPriceCache.timestamp) < PRICE_CACHE_DURATION) {
      return ethPriceCache.price;
    }

    const response = await axiosInstance.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );
    
    const price = response.data.ethereum.usd;
    ethPriceCache = { price, timestamp: now };
    
    return price;
  } catch (error) {
    console.error('Error fetching ETH price:', error.message);
    return ethPriceCache.price; // Return cached price if available
  }
}

// Helper function to get current balance
async function getCurrentBalance(address) {
  try {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('Error fetching balance:', error.message);
    throw new Error('Failed to fetch wallet balance');
  }
}

app.get('/transactions-stream/:address/:startBlock', asyncHandler(async (req, res) => {
  const { address, startBlock } = req.params;
  
  // Validate inputs
  const addressValidation = validateEthereumAddress(address);
  if (!addressValidation.valid) {
    return res.status(400).json({ error: addressValidation.error });
  }
  
  const currentBlock = await provider.getBlockNumber();
  const blockValidation = validateBlockNumber(startBlock, currentBlock);
  if (!blockValidation.valid) {
    return res.status(400).json({ error: blockValidation.error });
  }

  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  let allTransactions = [];
  let page = 1;
  const maxOffset = parseInt(process.env.TRANSACTIONS_PER_PAGE) || 1000;
  const maxPages = Math.floor(10000 / maxOffset); // Calculate max pages to stay under 10k limit
  
  try {
    // Send initial data
    const [ethPrice, currentBalance] = await Promise.all([
      getEthPrice().catch(() => null),
      getCurrentBalance(address).catch(() => null)
    ]);

    res.write(`data: ${JSON.stringify({
      type: 'initial',
      address,
      startBlock: blockValidation.value,
      currentBlock,
      ethPrice,
      currentBalance,
      balanceValue: ethPrice && currentBalance ? (ethPrice * parseFloat(currentBalance)).toFixed(2) : null,
      maxPages,
      maxTransactions: maxPages * maxOffset
    })}\n\n`);

    // Stream transactions with pagination limit
    while (page <= maxPages) {
      const response = await axiosInstance.get('https://api.etherscan.io/api', {
        params: {
          module: 'account',
          action: 'txlist',
          address: address,
          startblock: blockValidation.value,
          endblock: currentBlock,
          page: page,
          offset: maxOffset,
          sort: 'desc',
          apikey: process.env.ETHERSCAN_API_KEY
        }
      });

      if (response.data.status !== '1') {
        if (response.data.message === 'No transactions found') {
          break;
        }
        // Handle the specific pagination error
        if (response.data.message && response.data.message.includes('Result window is too large')) {
          res.write(`data: ${JSON.stringify({
            type: 'warning',
            message: `Reached Etherscan API limit. Showing first ${allTransactions.length} transactions. For complete history, try a smaller block range.`
          })}\n\n`);
          break;
        }
        throw new Error(`Etherscan API error: ${response.data.message}`);
      }

      const transactions = response.data.result.map(tx => {
        const ethValue = ethers.formatEther(tx.value);
        const gasPrice = ethers.formatUnits(tx.gasPrice, 'gwei');
        const transactionFee = (parseFloat(gasPrice) * parseFloat(tx.gasUsed) / 1e9);
        
        return {
          hash: tx.hash,
          blockNumber: parseInt(tx.blockNumber),
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
          from: tx.from,
          to: tx.to,
          value: ethValue,
          valueFormatted: parseFloat(ethValue).toFixed(6),
          gasPrice: gasPrice,
          gasPriceFormatted: parseFloat(gasPrice).toFixed(2),
          gasUsed: tx.gasUsed,
          transactionFee: transactionFee.toFixed(6),
          isError: tx.isError === '1'
        };
      });

      allTransactions.push(...transactions);

      // Send batch of transactions
      res.write(`data: ${JSON.stringify({
        type: 'transactions',
        transactions: transactions,
        page: page,
        totalCount: allTransactions.length,
        batchSize: transactions.length,
        reachedLimit: page >= maxPages,
        isLastPage: transactions.length < maxOffset
      })}\n\n`);

      // If we got fewer transactions than requested, we've reached the end
      if (transactions.length < maxOffset) {
        break;
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, process.env.API_DELAY || 200));
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      totalTransactions: allTransactions.length,
      totalPages: page - 1,
      limitReached: page > maxPages,
      maxPossibleTransactions: maxPages * maxOffset
    })}\n\n`);

  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
  }

  res.end();
}));

// 2. Modified regular route to render initial page
app.post('/transactions', asyncHandler(async (req, res) => {
  const { address, startBlock } = req.body;
  
  // Validate address
  const addressValidation = validateEthereumAddress(address);
  if (!addressValidation.valid) {
    return res.render('index', { error: addressValidation.error });
  }
  
  // Get current block for validation
  const currentBlock = await provider.getBlockNumber();
  
  // Validate block number
  const blockValidation = validateBlockNumber(startBlock, currentBlock);
  if (!blockValidation.valid) {
    return res.render('index', { error: blockValidation.error });
  }

  // Render the streaming results page
  res.render('results', {
    address,
    startBlock: blockValidation.value,
    currentBlock
  });
}));
// Helper function to get token balance at specific block
async function getTokenBalanceAtBlock(walletAddress, tokenAddress, blockNumber, decimals) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(walletAddress, { blockTag: blockNumber });
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    console.error(`Error getting token balance for ${tokenAddress}:`, error.message);
    return '0';
  }
}

// Helper function to get token prices with caching
let tokenPriceCache = { prices: {}, timestamp: 0 };

async function getTokenPrices() {
  try {
    const now = Date.now();
    if (Object.keys(tokenPriceCache.prices).length > 0 && 
        (now - tokenPriceCache.timestamp) < PRICE_CACHE_DURATION) {
      return tokenPriceCache.prices;
    }

    const response = await axiosInstance.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin,chainlink,uniswap,dai&vs_currencies=usd'
    );
    
    const prices = {
      'USDT': response.data.tether?.usd || 0,
      'USDC': response.data['usd-coin']?.usd || 0,
      'LINK': response.data.chainlink?.usd || 0,
      'UNI': response.data.uniswap?.usd || 0,
      'DAI': response.data.dai?.usd || 0
    };
    
    tokenPriceCache = { prices, timestamp: now };
    return prices;
  } catch (error) {
    console.error('Error fetching token prices:', error.message);
    return tokenPriceCache.prices || {};
  }
}

// Enhanced balance check with tokens
app.post('/balance-at-date', asyncHandler(async (req, res) => {
    const { address, date } = req.body;
    
    // 1. Validate address
    const addressValidation = validateEthereumAddress(address);
    if (!addressValidation.valid) {
      return res.render('index', { error: addressValidation.error });
    }
    
    // 2. Validate date
    const dateValidation = validateDate(date);
    if (!dateValidation.valid) {
      return res.render('index', { error: dateValidation.error });
    }
  
    // 3. Convert date to timestamp
    const targetDate = dateValidation.value; // This comes from validateDate()
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
    
    // 4. Binary search to find closest block
    let low = 0;
    let high = await provider.getBlockNumber();
    let closestBlock = high;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await provider.getBlock(mid);
      
      if (block.timestamp < targetTimestamp) {
        low = mid + 1;
      } else {
        high = mid - 1;
        closestBlock = mid;
      }
    }
    
    // 5. Get ETH balance and token prices in parallel
    const results = await Promise.allSettled([
      provider.getBalance(address, closestBlock),
      getEthPrice(),
      getTokenPrices()
    ]);
  
    const ethBalance = results[0].status === 'fulfilled' ? results[0].value : null;
    const ethPrice = results[1].status === 'fulfilled' ? results[1].value : null;
    const tokenPrices = results[2].status === 'fulfilled' ? results[2].value : {};
  
    if (!ethBalance) {
      return res.render('index', { 
        error: 'Failed to fetch balance at specified date' 
      });
    }
    
    // 6. Get all token balances in parallel
    const tokenBalancePromises = POPULAR_TOKENS.map(async (token) => {
      const balance = await getTokenBalanceAtBlock(
        address, 
        token.address, 
        closestBlock, 
        token.decimals
      );
      
      const balanceNum = parseFloat(balance);
      const price = tokenPrices[token.symbol] || 0;
      const value = balanceNum * price;
      
      return {
        ...token,
        balance: balance,
        balanceFormatted: balanceNum.toFixed(6),
        price: price,
        value: value,
        valueFormatted: value.toFixed(2)
      };
    });
    
    const tokenBalances = await Promise.all(tokenBalancePromises);
    
    // 7. Filter out tokens with zero balance
    const nonZeroTokens = tokenBalances.filter(token => parseFloat(token.balance) > 0);
    
    // 8. Calculate total portfolio value
    const formattedEthBalance = ethers.formatEther(ethBalance);
    const ethValue = ethPrice ? (ethPrice * parseFloat(formattedEthBalance)) : 0;
    const totalTokenValue = nonZeroTokens.reduce((sum, token) => sum + token.value, 0);
    const totalPortfolioValue = ethValue + totalTokenValue;
    
    const block = await provider.getBlock(closestBlock);
    const blockDate = new Date(block.timestamp * 1000).toLocaleString();
    
    // 9. Render the balance view with all data
    res.render('balance', {
      address,
      date,
      ethBalance: formattedEthBalance,
      ethBalanceValue: ethPrice ? ethValue.toFixed(2) : null,
      ethPrice,
      tokenBalances: nonZeroTokens,
      totalPortfolioValue: totalPortfolioValue.toFixed(2),
      blockNumber: closestBlock,
      blockDate,
      hasTokens: nonZeroTokens.length > 0,
      errors: {
        priceError: results[1].status === 'rejected',
        tokenPriceError: results[2].status === 'rejected'
      }
    });
  }));

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).render('index', { 
    error: 'An unexpected error occurred. Please try again later.' 
  });
});

// 404 handler (must be after all routes but before app.listen)
app.use((req, res) => {
  res.status(404).render('404');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});