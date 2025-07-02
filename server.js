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
  const transactions = [];
  
  // Get all transaction receipts for the address
  const logs = await provider.getLogs({
    address: address,
    fromBlock: startBlock,
    toBlock: endBlock
  });

  // Process each transaction
  for (const log of logs) {
    try {
      const tx = await provider.getTransaction(log.transactionHash);
      const receipt = await provider.getTransactionReceipt(log.transactionHash);
      const block = await provider.getBlock(log.blockNumber);

      transactions.push({
        hash: tx.hash,
        blockNumber: log.blockNumber,
        timestamp: new Date(block.timestamp * 1000).toLocaleString(),
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        gasPrice: ethers.formatUnits(tx.gasPrice, 'gwei'),
        gasUsed: receipt.gasUsed.toString()
      });
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  }

  return transactions;
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
