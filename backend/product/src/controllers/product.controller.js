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

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Bug 1 fixed: invalid ObjectId → 400 (not 404)
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }

        // Bug 2 fixed: req.seller (set by auth middleware) not req.user.id
        const requestingSeller = req.seller;

        // Bug 3 fixed: 403 when no seller identity present (unauthenticated body)
        if (!requestingSeller) {
            return res.status(403).json({ message: 'Forbidden: seller identity required' });
        }

        // Search by both product ID and seller ID in one query
        const existingProduct = await productModel.findOne({
            _id: id,
            seller: requestingSeller
        });

        if (!existingProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // ── Field validation ─────────────────────────────────────────────────
        const { title, description, price, stock, varaints } = req.body;

        if (title !== undefined && title.trim() === '') {
            return res.status(400).json({ message: 'Title cannot be empty' });
        }

        if (price !== undefined && typeof price === 'object') {
            if (price.amount !== undefined) {
                const amt = Number(price.amount);
                if (isNaN(amt) || amt < 0) {
                    return res.status(400).json({ message: 'Price amount cannot be negative' });
                }
            }
            if (price.currency !== undefined && !['INR', 'USD'].includes(price.currency)) {
                return res.status(400).json({ message: 'Price currency must be INR or USD' });
            }
        }

        if (stock !== undefined && typeof stock === 'object') {
            if (stock.quantity !== undefined) {
                const qty = Number(stock.quantity);
                if (isNaN(qty) || qty < 0) {
                    return res.status(400).json({ message: 'Stock quantity cannot be negative' });
                }
            }
        }

        if (varaints !== undefined) {
            if (!Array.isArray(varaints) || varaints.length === 0) {
                return res.status(400).json({ message: 'Variants must not be empty' });
            }
        }

        // ── Upload new images if provided ────────────────────────────────────
        if (req.files && req.files.length > 0) {
            const uploadedImages = await uploadImages(req.files);
            existingProduct.images = uploadedImages;
        }

        // ── Apply allowed field updates ──────────────────────────────────────
        const allowedUpdates = ['title', 'description', 'price', 'stock', 'varaints'];
        for (const key of Object.keys(req.body)) {
            if (!allowedUpdates.includes(key)) continue;

            // Bug 6 fixed: was using undefined `product` var — now uses existingProduct
            if (key === 'price' && typeof req.body.price === 'object') {
                if (req.body.price.amount !== undefined) {
                    existingProduct.price.amount = Number(req.body.price.amount);
                }
                if (req.body.price.currency !== undefined) {
                    existingProduct.price.currency = req.body.price.currency;
                }
            } else if (key === 'stock' && typeof req.body.stock === 'object') {
                if (req.body.stock.quantity !== undefined) {
                    existingProduct.stock.quantity = Number(req.body.stock.quantity);
                }
            } else {
                existingProduct[key] = req.body[key];
            }
        }

        await existingProduct.save();

        return res.status(200).json({
            message: 'Product updated successfully',
            product: existingProduct
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }

        // 2. Require seller identity (set by auth middleware from req.body.seller in test mode)
        const requestingSeller = req.seller;
        if (!requestingSeller) {
            return res.status(403).json({ message: 'Forbidden: seller identity required' });
        }

        // 3. Find by both _id and seller in one query — null means not found OR wrong owner
        const product = await productModel.findOne({
            _id: id,
            seller: requestingSeller
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // 4. Delete the product
        await product.deleteOne();

        return res.status(200).json({
            message: 'Product deleted successfully',
            product
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}
const getSellerProduct = async (req, res) => {
    try {
        const { skip = 0, limit = 20, minPrice, maxPrice } = req.query;

        const filter = { seller: req.seller };

        if (minPrice) {
            filter['price.amount'] = { $gte: Number(minPrice) };
        }
        if (maxPrice) {
            filter['price.amount'] = { $lte: Number(maxPrice) };
        }

        const products = await productModel
            .find(filter)
            .skip(Number(skip))
            .limit(Math.min(20, Number(limit)));

        return res.status(200).json({
            message: 'Products fetched successfully',
            products
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}


module.exports = {
    createProduct,
    getAllProducts,
    getProduct,
    updateProduct,
    deleteProduct,
    getSellerProduct
};
