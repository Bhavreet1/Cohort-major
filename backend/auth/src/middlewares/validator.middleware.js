const { body, validationResult } = require('express-validator');

const respondWithValidationErrors = (req, res, next) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields",
            errors: errors.array()
        })
    }
    next()
}

const registerUserValidations = [
    body('username')
        .isString()
        .withMessage('Username must be a string')
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters long'),
    body('email')
        .isEmail()
        .withMessage('Invalid email address')
        .notEmpty()
        .withMessage('Email is required')
        .isLength({ max: 254 })
        .withMessage('Email must not exceed 254 characters'),
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Password must be between 6 and 128 characters long')
        .notEmpty()
        .withMessage('Password is required'),
    body('fullName.firstName')
        .isString()
        .withMessage('First name must be a string')
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters long'),
    body('fullName.lastName')
        .isString()
        .withMessage('Last name must be a string')
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters long'),
    respondWithValidationErrors
]

const loginUserValidations = [
    body('username')
        .isString()
        .withMessage('Username must be a string')
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ max: 30 })
        .withMessage('Username must not exceed 30 characters'),
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Password must be between 6 and 128 characters long')
        .notEmpty()
        .withMessage('Password is required'),
    respondWithValidationErrors
]

const addAddressValidations = [
    body('street')
        .isString()
        .withMessage('Street must be a string')
        .notEmpty()
        .withMessage('Street is required')
        .isLength({ max: 100 })
        .withMessage('Street must not exceed 100 characters'),
    body('city')
        .isString()
        .withMessage('City must be a string')
        .notEmpty()
        .withMessage('City is required')
        .isLength({ max: 100 })
        .withMessage('City must not exceed 100 characters'),
    body('state')
        .isString()
        .withMessage('State must be a string')
        .notEmpty()
        .withMessage('State is required')
        .isLength({ max: 100 })
        .withMessage('State must not exceed 100 characters'),
    body('zipCode')
        .isString()
        .withMessage('Zip code must be a string')
        .notEmpty()
        .withMessage('Zip code is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('Zip code must be exactly 6 characters long'),
    body('country')
        .isString()
        .withMessage('Country must be a string')
        .notEmpty()
        .withMessage('Country is required')
        .isLength({ max: 100 })
        .withMessage('Country must not exceed 100 characters'),
    respondWithValidationErrors
]

module.exports = {registerUserValidations,loginUserValidations,addAddressValidations};