const cartModel = require("../models/cart.model");
const addItemsToCart = async (req, res) => {
    try {
        console.log("reached cart controller");
        console.log("body::", req.body);
    } catch (error) {
        console.log(error)
    }
}

module.exports = { addItemsToCart };