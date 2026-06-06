const express = require('express');
const multer = require("multer");
const productController = require('../controllers/product.controller');
const router = express.Router();
const createAuthMiddleware = require('../middlewares/auth.middleware');
const { createProductValidation } = require('../middlewares/validator.middleware');

const upload = multer({ storage: multer.memoryStorage() });


router.post("/", createAuthMiddleware(["admin","seller"]), upload.array("images", 5), createProductValidation, productController.createProduct);
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProduct);
router.patch("/:id", upload.array("images", 5), createAuthMiddleware(["seller", "admin"]), productController.updateProduct);
router.delete("/:id", createAuthMiddleware(["seller", "admin"]), productController.deleteProduct);
module.exports = router;