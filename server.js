require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const path = require('path');
const axios = require('axios');

const app = express();

// Configure EJS as view engine
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize Ethereum provider
const provider = new ethers.InfuraProvider('homestead', process.env.INFURA_API_KEY);

// Home route - display form
app.get('/', (req, res) => {
  res.render('index');
});

// Helper function to get ETH price
async function getEthPrice() {
  try {
    const config = {};
    
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      config
    );
    return response.data.ethereum.usd;
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    return null;
  }
}

// Helper function to get current balance
async function getCurrentBalance(address) {
  try {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    return null;
  }
}

// Helper function to get transactions (updated for ethers v6)
async function getTransactions(address, startBlock, endBlock) {
    const allTransactions = [];
    let page = 1;
    const maxPages = 10; // Adjust based on your needs
    
    try {
      while (page <= maxPages) {
        console.log(`Fetching page ${page} of transactions...`);
        
        const response = await axios.get('https://api.etherscan.io/api', {
          params: {
            module: 'account',
            action: 'txlist',
            address: address,
            startblock: startBlock,
            endblock: endBlock,
            page: page,
            offset: 1000, // Maximum allowed by Etherscan
            sort: 'desc',
            apikey: process.env.ETHERSCAN_API_KEY
          }
        });
  
        if (response.data.status !== '1') {
          if (response.data.message === 'No transactions found') {
            console.log('No more transactions found');
            break;
          }
          throw new Error('Etherscan API error: ' + response.data.message);
        }
  
        const transactions = response.data.result.map(tx => {
          const ethValue = ethers.formatEther(tx.value);
          return {
            hash: tx.hash,
            blockNumber: parseInt(tx.blockNumber),
            timestamp: new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
            from: tx.from,
            to: tx.to,
            value: ethValue,
            valueFormatted: parseFloat(ethValue).toFixed(6), // Format to 6 decimal places
            gasPrice: ethers.formatUnits(tx.gasPrice, 'gwei'),
            gasPriceFormatted: parseFloat(ethers.formatUnits(tx.gasPrice, 'gwei')).toFixed(2),
            gasUsed: tx.gasUsed,
            transactionFee: (parseFloat(ethers.formatUnits(tx.gasPrice, 'gwei')) * parseFloat(tx.gasUsed) / 1e9).toFixed(6)
          };
        });
  
        allTransactions.push(...transactions);
        console.log(`Added ${transactions.length} transactions. Total: ${allTransactions.length}`);
        
        // If we got less than 1000 transactions, we've reached the end
        if (transactions.length < 1000) {
          console.log('Reached end of transactions');
          break;
        }
        
        page++;
        
        // Add delay to respect Etherscan rate limits (5 calls per second for free tier)
        await new Promise(resolve => setTimeout(resolve, 250));
      }
  
      console.log(`Total transactions fetched: ${allTransactions.length}`);
      return allTransactions;
      
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return allTransactions; // Return partial results if available
    }
}

// Handle form submission for transactions
app.post('/transactions', async (req, res) => {
  try {
    const { address, startBlock } = req.body;
    
    // Validate input
    if (!ethers.isAddress(address)) {
      return res.render('index', { error: 'Invalid Ethereum address' });
    }
    
    const currentBlock = await provider.getBlockNumber();
    const startBlockNum = parseInt(startBlock);
    
    if (isNaN(startBlockNum)) {
      return res.render('index', { error: 'Invalid block number' });
    }

    // Get all data in parallel
    const [transactions, ethPrice, currentBalance] = await Promise.all([
      getTransactions(address, startBlockNum, currentBlock),
      getEthPrice(),
      getCurrentBalance(address)
    ]);

    res.render('results', {
      address,
      startBlock: startBlockNum,
      currentBlock,
      transactions,
      count: transactions.length,
      ethPrice,
      currentBalance,
      balanceValue: ethPrice && currentBalance ? (ethPrice * parseFloat(currentBalance)).toFixed(2) : null
    });

  } catch (error) {
    console.error('Error:', error);
    res.render('index', { 
      error: `Error fetching transactions: ${error.message}` 
    });
  }
});

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
      address: '0xA0b86a33E6441b2aa7F40E8C3E0e6B0b3b72f0C9',
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
  
  // Helper function to get token balance at specific block
  async function getTokenBalanceAtBlock(walletAddress, tokenAddress, blockNumber, decimals) {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await contract.balanceOf(walletAddress, { blockTag: blockNumber });
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error(`Error getting token balance for ${tokenAddress}:`, error);
      return '0';
    }
  }
  
  // Helper function to get token prices (you'll need a price API)
  async function getTokenPrices() {
    try {
      const symbols = POPULAR_TOKENS.map(token => token.symbol.toLowerCase()).join(',');
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin,chainlink,uniswap,dai&vs_currencies=usd`
      );
      
      return {
        'USDT': response.data.tether?.usd || 0,
        'USDC': response.data['usd-coin']?.usd || 0,
        'LINK': response.data.chainlink?.usd || 0,
        'UNI': response.data.uniswap?.usd || 0,
        'DAI': response.data.dai?.usd || 0
      };
    } catch (error) {
      console.error('Error fetching token prices:', error);
      return {};
    }
  }
  
  // Enhanced balance check with tokens
  app.post('/balance-at-date', async (req, res) => {
    try {
      const { address, date } = req.body;
      
      if (!ethers.isAddress(address)) {
        return res.render('index', { error: 'Invalid Ethereum address' });
      }
  
      const targetDate = new Date(date);
      const today = new Date();
      
      if (targetDate > today) {
        return res.render('index', { error: 'Cannot check balance for future dates' });
      }
  
      const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
      
      // Binary search to find closest block (your existing code)
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
      
      // Get ETH balance and token prices in parallel
      const [ethBalance, ethPrice, tokenPrices] = await Promise.all([
        provider.getBalance(address, closestBlock),
        getEthPrice(),
        getTokenPrices()
      ]);
      
      // Get all token balances in parallel
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
      
      // Filter out tokens with zero balance
      const nonZeroTokens = tokenBalances.filter(token => parseFloat(token.balance) > 0);
      
      // Calculate total portfolio value
      const formattedEthBalance = ethers.formatEther(ethBalance);
      const ethValue = ethPrice ? (ethPrice * parseFloat(formattedEthBalance)) : 0;
      const totalTokenValue = nonZeroTokens.reduce((sum, token) => sum + token.value, 0);
      const totalPortfolioValue = ethValue + totalTokenValue;
      
      const block = await provider.getBlock(closestBlock);
      const blockDate = new Date(block.timestamp * 1000).toLocaleString();
      
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
        hasTokens: nonZeroTokens.length > 0
      });
  
    } catch (error) {
      console.error('Error:', error);
      res.render('index', { 
        error: `Error fetching balance: ${error.message}` 
      });
    }
  });

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.use((req,res) => {
    res.status(404).render("404");
})
