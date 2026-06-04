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

const getAllProducts = async (req, res) => {
    try {
        const filter = {};
        const { q, limit = 20, minPrice, maxPrice, skip = 0 } = req.query;
        
        if (q) {
            filter.$text = { $search: q };
        }
        if (minPrice) {
            filter['price.amount'] = { $gte: Number(minPrice) };
        }
        if (maxPrice) {
            filter['price.amount'] = {$lte: Number(maxPrice)};
        }

        const products = await productModel.find(filter).limit(Math.min(20, Number(limit))).skip(Math.min(20, Number(skip)));
        res.status(200).json({
            message: "Products fetched successfully",
            products
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

const getProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }

        const product = await productModel.findById(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({
            message: 'Product fetched successfully',
            product
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

module.exports = {
    createProduct,
    getAllProducts,
    getProduct
};
