const mongoose = require("mongoose");
const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, "Quantity must be at least 1"]
        },
    }],
    totalAmount: {
        type: Number
    }
}, {
    timestamps: true
});

const cartModel = mongoose.model("Cart", cartSchema);

module.exports = cartModel;