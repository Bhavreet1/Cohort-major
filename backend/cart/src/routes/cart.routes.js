const express = require("express");
const router = express.Router();
const { addItemsToCart } = require("../controllers/cart.controller");

//to add new cart item 

router.post("/items", addItemsToCart);

module.exports = router;