const express = require("express");
const router = express.Router();
const { addItemsToCart } = require("../controllers/cart.controller");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const { addItemsToCartValidation } = require("../middlewares/validation.middleware");

//to add new cart item 

router.post("/items", createAuthMiddleware(["user"]),addItemsToCartValidation(),addItemsToCart);

module.exports = router;