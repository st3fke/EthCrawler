require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const path = require('path');

const app = express();

app.set("view engine", "ejs");
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));

app.listen(process.env.PORT, () =>
{
        console.log(`server je pokrenut na portu ${process.env.PORT}`);
})

app.get("/", (req,res)=>{
    res.render("index", {title: "Home"});
})

app.use((req,res) => {
    res.status(404).render("404", {title: "404"});
})
