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

// Handle form submission for balance check
app.post('/balance-at-date', async (req, res) => {
  try {
    const { address, date } = req.body;
    
    if (!ethers.isAddress(address)) {
      return res.render('index', { error: 'Invalid Ethereum address' });
    }

    const targetDate = new Date(date);
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
    
    // Binary search to find closest block
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
    
    // Get all data in parallel
    const [balance, ethPrice] = await Promise.all([
      provider.getBalance(address, closestBlock),
      getEthPrice()
    ]);
    
    const formattedBalance = ethers.formatEther(balance);
    const block = await provider.getBlock(closestBlock);
    const blockDate = new Date(block.timestamp * 1000).toLocaleString();
    
    res.render('balance', {
      address,
      date,
      balance: formattedBalance,
      balanceValue: ethPrice ? (ethPrice * parseFloat(formattedBalance)).toFixed(2) : null,
      ethPrice,
      blockNumber: closestBlock,
      blockDate
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
