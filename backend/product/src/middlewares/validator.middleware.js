const { body, validationResult } = require('express-validator');

const normalizeProductBody = (req, res, next) => {
    if (req.body) {
        // --- Parse price ---
        if (typeof req.body.price === 'string') {
            try {
                req.body.price = JSON.parse(req.body.price);
            } catch (e) {
                // Ignore parse errors, let it remain a string
            }
        }
        
        if (typeof req.body.price !== 'object' || req.body.price === null) {
            req.body.price = {};
        }

        if (req.body['price[amount]'] !== undefined) {
            req.body.price.amount = req.body['price[amount]'];
            delete req.body['price[amount]'];
        }
        if (req.body['price.amount'] !== undefined) {
            req.body.price.amount = req.body['price.amount'];
            delete req.body['price.amount'];
        }

        if (req.body['price[currency]'] !== undefined) {
            req.body.price.currency = req.body['price[currency]'];
            delete req.body['price[currency]'];
        }
        if (req.body['price.currency'] !== undefined) {
            req.body.price.currency = req.body['price.currency'];
            delete req.body['price.currency'];
        }

        // --- Parse stock ---
        if (typeof req.body.stock === 'string') {
            try {
                req.body.stock = JSON.parse(req.body.stock);
            } catch (e) {
                // Ignore parse errors
            }
        }

        if (typeof req.body.stock !== 'object' || req.body.stock === null) {
            req.body.stock = {};
        }

        if (req.body['stock[quantity]'] !== undefined) {
            req.body.stock.quantity = req.body['stock[quantity]'];
            delete req.body['stock[quantity]'];
        }
        if (req.body['stock.quantity'] !== undefined) {
            req.body.stock.quantity = req.body['stock.quantity'];
            delete req.body['stock.quantity'];
        }

        // --- Parse variants (spelled varaints to match schema) ---
        if (typeof req.body.varaints === 'string' && req.body.varaints.trim().startsWith('[')) {
            try {
                req.body.varaints = JSON.parse(req.body.varaints);
            } catch (e) {
                // Ignore parse errors
            }
        }

        let variants = [];
        if (Array.isArray(req.body.varaints)) {
            variants = req.body.varaints;
        } else if (req.body.varaints) {
            variants = [req.body.varaints];
        } else {
            let i = 0;
            while (req.body[`varaints[${i}]`] !== undefined) {
                variants.push(req.body[`varaints[${i}]`]);
                delete req.body[`varaints[${i}]`];
                i++;
            }
            i = 0;
            while (req.body[`varaints.${i}`] !== undefined) {
                variants.push(req.body[`varaints.${i}`]);
                delete req.body[`varaints.${i}`];
                i++;
            }
        }
        req.body.varaints = variants;

        // Populate seller from authenticated token if not provided in the body
        if ((!req.body.seller || req.body.seller === '') && req.seller) {
            req.body.seller = req.seller;
        }
    }
    next();
};

const respondWithValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields",
            errors: errors.array()
        });
    }
    next();
};

const createProductValidation = [
    normalizeProductBody,
    body('title')
        .isString()
        .withMessage('Title must be a string')
        .notEmpty()
        .withMessage('Title is required'),
    body('description')
        .optional()
        .isString()
        .withMessage('Description must be a string'),
    body('price.amount')
        .notEmpty()
        .withMessage('Price amount is required')
        .custom((value) => {
            const num = Number(value);
            if (isNaN(num)) {
                throw new Error('Price amount must be a number');
            }
            if (num < 0) {
                throw new Error('Price amount cannot be negative');
            }
            return true;
        }),
    body('price.currency')
        .optional()
        .isIn(['INR', 'USD'])
        .withMessage('Price currency must be INR or USD'),
    body('stock.quantity')
        .notEmpty()
        .withMessage('Stock quantity is required')
        .custom((value) => {
            const num = Number(value);
            if (isNaN(num)) {
                throw new Error('Stock quantity must be a number');
            }
            if (num < 0) {
                throw new Error('Stock quantity cannot be negative');
            }
            return true;
        }),
    body('seller')
        .notEmpty()
        .withMessage('Seller is required')
        .isMongoId()
        .withMessage('Invalid seller ID format')
        .custom((value, { req }) => {
            // Enforce role authorization
            if (req.role !== 'admin' && req.role !== 'seller') {
                throw new Error('Only sellers and admins are authorized to create products');
            }
            // Enforce ownership: sellers can only create products with their own ID
            if (req.role === 'seller' && value !== req.seller) {
                throw new Error('Sellers can only create products under their own seller ID');
            }
            return true;
        }),
    body('varaints')
        .isArray({ min: 1 })
        .withMessage('Variants must not be empty')
        .custom((value) => {
            if (!value.every(v => typeof v === 'string' && v.trim() !== '')) {
                throw new Error('All variants must be non-empty strings');
            }
            return true;
        }),
    respondWithValidationErrors
];

module.exports = { createProductValidation };