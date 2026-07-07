const { body, validationResult } = require("express-validator");

const addItemsToCartValidation = () =>{
    return [
        body("productId").notEmpty().withMessage("Product ID is required"),
        body("quantity").notEmpty().withMessage("Quantity is required"),
        body("price").notEmpty().withMessage("Price is required"),
        body("sellerId").notEmpty().withMessage("Seller ID is required"),
        body("userId").notEmpty().withMessage("User ID is required"),
    ]
}

module.exports = {addItemsToCartValidation}