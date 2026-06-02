const mongoose = require('mongoose');
const productModel = require('../models/products.model');
const { uploadImages } = require("../services/imagekit.service");

const createProduct = async (req, res) => {
    try {
        const { title, description, price, stock, seller, varaints } = req.body;

        // 1. Upload images to ImageKit if any files are attached
        let uploadedImages = [];
        if (req.files && req.files.length > 0) {
            uploadedImages = await uploadImages(req.files);
        }

        // 2. Create and save product to MongoDB
        const productData = {
            title,
            description,
            price: {
                amount: Number(price.amount),
                currency: price.currency || 'INR'
            },
            stock: {
                quantity: Number(stock.quantity)
            },
            seller,
            varaints,
            images: uploadedImages
        };

        const newProduct = new productModel(productData);
        await newProduct.save();

        res.status(201).json({
            message: "Product created successfully",
            product: newProduct
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error("Error creating product:", error);
        }
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createProduct
};
