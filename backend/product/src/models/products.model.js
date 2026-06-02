const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
    },
    price: {
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            enum: ["INR", "USD"],
            default: "INR",
        }
    },
    stock: {
        quantity: {
            type: Number,
            required: true
        },
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    images: [{
        url: String,
        thumbnail: String,
        id: String,
    }],

    varaints: [{
        type: String,
        required: true
    }]
},{
    timestamps : true
})

const productModel = mongoose.model("Product", productSchema);

module.exports = productModel;