# 🧾 Ethereum Wallet Explorer

This is a **Node.js + Express** application that allows users to:

- 🔎 View all **ETH transactions** for a given Ethereum wallet starting from a given block.
- 💰 Check the **current balance** and its USD value.
- 📊 Retrieve **historical balance** at a specific date (`YYYY-MM-DD 00:00 UTC`).
- 🪙 Track balances of popular **ERC-20 tokens** (USDT, USDC, DAI, LINK, UNI) and their USD values.

---

## 🚀 Features

- ✅ ETH transaction history (with gas fees and USD value)
- ✅ ETH & ERC-20 balance viewer for any date
- ✅ Simple EJS-based web interface
- ✅ Etherscan + Infura + CoinGecko integration
- ✅ Error handling, rate limiting & performance optimization
- ✅ Styled results display with real-time data fetching

---

## 📁 Project Structure

```
ethereum-wallet-explorer/
├── public/             # Static assets (CSS/images)
├── views/              # EJS templates
│   ├── index.ejs       # Home page with form
│   ├── results.ejs     # Transaction result display
│   ├── balance.ejs     # Historical balance display
│   ├── 404.ejs         # Custom 404 page
├── .env.example        # Environment variable example
├── server.js           # Main application logic
├── package.json
└── README.md           # You're here!
```

---

## 🧪 Prerequisites

Make sure you have the following installed:

- ✅ Node.js (v18+ recommended)
- ✅ npm

---

## 🔧 Installation

**Clone the repo:**

```bash
git clone https://github.com/YOUR_USERNAME/ethereum-wallet-explorer.git
cd ethereum-wallet-explorer
```

**Install dependencies:**

```bash
npm install
npm install dotenv express ethers path axios express-rate-limit ejs
```

## 🧑‍💻 Running the Project

```bash
node server
```

The app will start at:  
➡️ [http://localhost:3000](http://localhost:3000)

---

## 📄 Usage

### 🔍 View ETH transactions:
- Enter Ethereum wallet address and starting block
- Click **"Fetch Transactions"**

### 📆 Check balance on date:
- Enter Ethereum wallet address and a date (`YYYY-MM-DD`)
- Click **"Check Balance at Date"**
- You'll get **ETH + token balances** and their **USD values**

---

## 🌐 APIs Used

- 🛰️ **Etherscan API** – for transaction history  
- 🔌 **Infura (Web3)** – for balance and block data  
- 💸 **CoinGecko API** – for ETH/token USD prices

---

## ✅ Example Inputs

Use the following values to test:

- **Address**: `0xaa7a9ca87d3694b5755f213b5d04094b8d0f0a6f`
- **Start Block**: `9000000`
- **Date**: `2023-01-01`

---

## 🧯 Troubleshooting

- **Missing required environment variables**  
  ➜ Make sure your `.env` file is filled out correctly.

- **Invalid API Key**  
  ➜ Double check your Etherscan and Infura API keys.

- **Transactions not appearing?**  
  ➜ Try a smaller block range or a different wallet address.

---

## 🛡 Security Features

- 🔒 Rate limiting (100 requests per 15 minutes per IP)
- 📛 Input validation (wallets, blocks, dates)
- ⚠️ Error handling and timeout protection

---

## 👩‍💻 Developer Notes

- Built with: **Express.js**, **EJS**, **ethers.js**
- Tokens supported by default: `USDT`, `USDC`, `DAI`, `LINK`, `UNI`
- To add more tokens, update the `POPULAR_TOKENS` array in `server.js`
