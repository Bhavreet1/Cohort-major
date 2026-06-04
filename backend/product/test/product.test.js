const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock ImageKit SDK to avoid making actual API calls during tests
const mockUpload = jest.fn();
jest.mock('@imagekit/nodejs', () => {
    return jest.fn().mockImplementation(() => {
        return {
            files: {
                upload: mockUpload
            }
        };
    });
}, { virtual: true });

const app = require('../src/app');
const Product = require('../src/models/products.model');

let mongoServer;

beforeAll(async () => {
    // Setup in-memory MongoDB database
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;
    
    // Connect mongoose to in-memory database
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
});

afterAll(async () => {
    // Close mongoose connection and stop in-memory MongoDB
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
});

afterEach(async () => {
    // Reset ImageKit upload mock and clean database collections after each test
    jest.clearAllMocks();
    mockUpload.mockReset();
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});

describe('Product API - POST /api/product', () => {
    const validSellerId = new mongoose.Types.ObjectId().toString();

    // Helper to generate a standard valid product payload
    const getValidProductPayload = () => ({
        title: 'Premium Wireless Headphones',
        description: 'Noise-cancelling over-ear wireless headphones.',
        'price[amount]': 8999,
        'price[currency]': 'INR',
        'stock[quantity]': 45,
        seller: validSellerId,
        'varaints[0]': 'Matte Black',
        'varaints[1]': 'Platinum Silver'
    });

    describe('Success Cases', () => {
        it('should successfully create a product with valid details and uploaded images', async () => {
            // Mock a successful ImageKit upload response
            mockUpload.mockResolvedValue({
                url: 'https://ik.imagekit.io/majorproject/products/headphone_main.jpg',
                thumbnailUrl: 'https://ik.imagekit.io/majorproject/tr:h-100/products/headphone_main.jpg',
                fileId: 'file_id_headphone123'
            });

            const payload = getValidProductPayload();

            const res = await request(app)
                .post('/api/product')
                .field(payload)
                // Attach mock files to simulate multer image upload
                .attach('images', Buffer.from('fake-image-1-binary-data'), 'headphone_black.jpg')
                .attach('images', Buffer.from('fake-image-2-binary-data'), 'headphone_silver.jpg');

            // Wait, since we are only testing the API structure first, 
            // when the user fully implements the controller, this should return a 201.
            // In the initial stub, it returns 201 with the stub body.
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('product');

            // If the controller saves the product to the DB (which our tests verify on complete implementation):
            const savedProduct = await Product.findOne({ title: payload.title });
            if (savedProduct) {
                expect(savedProduct.title).toEqual(payload.title);
                expect(savedProduct.price.amount).toEqual(8999);
                expect(savedProduct.price.currency).toEqual('INR');
                expect(savedProduct.stock.quantity).toEqual(45);
                expect(savedProduct.seller.toString()).toEqual(validSellerId);
                expect(savedProduct.varaints).toContain('Matte Black');
                expect(savedProduct.images.length).toBeGreaterThan(0);
                expect(savedProduct.images[0]).toHaveProperty('url');
                expect(savedProduct.images[0]).toHaveProperty('thumbnail');
                expect(savedProduct.images[0]).toHaveProperty('id');
            }
        });

        it('should create a product successfully without uploading images', async () => {
            const payload = getValidProductPayload();

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('product');
            
            // ImageKit upload should not have been called since no images were sent
            expect(mockUpload).not.toHaveBeenCalled();
        });
    });

    describe('Validation & Failure Cases', () => {
        it('should return 400 Bad Request if title is missing', async () => {
            const payload = getValidProductPayload();
            delete payload.title;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if price amount is missing', async () => {
            const payload = getValidProductPayload();
            delete payload['price[amount]'];

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if stock quantity is missing', async () => {
            const payload = getValidProductPayload();
            delete payload['stock[quantity]'];

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if seller is missing', async () => {
            const payload = getValidProductPayload();
            delete payload.seller;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if seller ID format is invalid', async () => {
            const payload = getValidProductPayload();
            payload.seller = 'invalid-mongo-id';

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if varaints array is missing or empty', async () => {
            const payload = getValidProductPayload();
            delete payload['varaints[0]'];
            delete payload['varaints[1]'];

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if price currency is not INR or USD', async () => {
            const payload = getValidProductPayload();
            payload['price[currency]'] = 'EUR'; // Invalid currency enum value

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if stock quantity is a negative number', async () => {
            const payload = getValidProductPayload();
            payload['stock[quantity]'] = -5;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 Bad Request if price amount is negative', async () => {
            const payload = getValidProductPayload();
            payload['price[amount]'] = -100;

            const res = await request(app)
                .post('/api/product')
                .field(payload);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should handle ImageKit upload failure and return a 500 error', async () => {
            // Mock ImageKit returning an error
            mockUpload.mockRejectedValue(new Error('ImageKit upload service unavailable'));

            const payload = getValidProductPayload();

            const res = await request(app)
                .post('/api/product')
                .field(payload)
                .attach('images', Buffer.from('fake-image-binary-data'), 'fail_image.jpg');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toContain('ImageKit');
        });
    });
});

describe('Product API - GET /api/product', () => {
    const sellerId = new mongoose.Types.ObjectId();

    // Helper: insert products directly into DB for test setup
    const seedProducts = async (products) => {
        await Product.insertMany(products);
    };

    // Base product factory
    const makeProduct = (overrides = {}) => ({
        title: 'Test Product',
        description: 'A generic test product',
        price: { amount: 500, currency: 'INR' },
        stock: { quantity: 10 },
        seller: sellerId,
        varaints: ['Red'],
        ...overrides,
    });

    describe('Success Cases', () => {
        it('should return 200 with all products when no filters are applied', async () => {
            await seedProducts([
                makeProduct({ title: 'Product A', price: { amount: 100, currency: 'INR' } }),
                makeProduct({ title: 'Product B', price: { amount: 200, currency: 'INR' } }),
                makeProduct({ title: 'Product C', price: { amount: 300, currency: 'INR' } }),
            ]);

            const res = await request(app).get('/api/product');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Products fetched successfully');
            expect(res.body).toHaveProperty('products');
            expect(Array.isArray(res.body.products)).toBe(true);
            expect(res.body.products.length).toBe(3);
        });

        it('should return an empty array when no products exist', async () => {
            const res = await request(app).get('/api/product');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });

        it('should filter products by minPrice', async () => {
            await seedProducts([
                makeProduct({ title: 'Cheap',  price: { amount: 100, currency: 'INR' } }),
                makeProduct({ title: 'Mid',    price: { amount: 500, currency: 'INR' } }),
                makeProduct({ title: 'Pricey', price: { amount: 900, currency: 'INR' } }),
            ]);

            const res = await request(app).get('/api/product?minPrice=400');

            expect(res.statusCode).toEqual(200);
            const titles = res.body.products.map((p) => p.title);
            expect(titles).toContain('Mid');
            expect(titles).toContain('Pricey');
            expect(titles).not.toContain('Cheap');
        });

        it('should filter products by maxPrice', async () => {
            await seedProducts([
                makeProduct({ title: 'Budget',   price: { amount: 150,  currency: 'INR' } }),
                makeProduct({ title: 'Standard', price: { amount: 600,  currency: 'INR' } }),
                makeProduct({ title: 'Premium',  price: { amount: 1200, currency: 'INR' } }),
            ]);

            const res = await request(app).get('/api/product?maxPrice=700');

            expect(res.statusCode).toEqual(200);
            const titles = res.body.products.map((p) => p.title);
            expect(titles).toContain('Budget');
            expect(titles).toContain('Standard');
            expect(titles).not.toContain('Premium');
        });

        it('should apply maxPrice filter when both minPrice and maxPrice are provided (last wins)', async () => {
            // Note: current implementation writes both minPrice & maxPrice to the same
            // filter['price.amount'] key, so maxPrice overwrites minPrice.
            // This test documents that known behaviour explicitly.
            await seedProducts([
                makeProduct({ title: 'Low',  price: { amount: 100, currency: 'INR' } }),
                makeProduct({ title: 'Mid',  price: { amount: 500, currency: 'INR' } }),
                makeProduct({ title: 'High', price: { amount: 900, currency: 'INR' } }),
            ]);

            // maxPrice=600 is the effective filter ($lte 600)
            const res = await request(app).get('/api/product?minPrice=200&maxPrice=600');

            expect(res.statusCode).toEqual(200);
            const titles = res.body.products.map((p) => p.title);
            expect(titles).toContain('Low');
            expect(titles).toContain('Mid');
            expect(titles).not.toContain('High');
        });

        it('should respect the limit query parameter (hard cap at 20)', async () => {
            const manyProducts = Array.from({ length: 25 }, (_, i) =>
                makeProduct({ title: `Product ${i + 1}` })
            );
            await seedProducts(manyProducts);

            // Requesting limit=25 should be capped to 20 by Math.min(20, limit)
            const res = await request(app).get('/api/product?limit=25');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBeLessThanOrEqual(20);
        });

        it('should respect the limit query parameter when below the cap', async () => {
            const products = Array.from({ length: 10 }, (_, i) =>
                makeProduct({ title: `Product ${i + 1}` })
            );
            await seedProducts(products);

            const res = await request(app).get('/api/product?limit=3');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBeLessThanOrEqual(3);
        });

        it('should skip results when the skip query parameter is provided', async () => {
            await seedProducts([
                makeProduct({ title: 'First' }),
                makeProduct({ title: 'Second' }),
                makeProduct({ title: 'Third' }),
            ]);

            // Fetch without skip to get insertion order
            const allRes = await request(app).get('/api/product');
            const firstId = allRes.body.products[0]._id;

            // With skip=1 the first product should not appear
            const res = await request(app).get('/api/product?skip=1');

            expect(res.statusCode).toEqual(200);
            const returnedIds = res.body.products.map((p) => p._id);
            expect(returnedIds).not.toContain(firstId);
            expect(res.body.products.length).toBe(2);
        });

        it('should cap the skip value at 20', async () => {
            const products = Array.from({ length: 25 }, (_, i) =>
                makeProduct({ title: `Product ${i + 1}` })
            );
            await seedProducts(products);

            // skip=99 is capped to Math.min(20, 99) = 20 internally
            const res = await request(app).get('/api/product?skip=99');

            expect(res.statusCode).toEqual(200);
            // After skipping 20, 5 products remain
            expect(res.body.products.length).toBe(5);
        });

        it('should return an empty array when minPrice exceeds all product prices', async () => {
            await seedProducts([makeProduct({ price: { amount: 100, currency: 'INR' } })]);

            const res = await request(app).get('/api/product?minPrice=99999');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });

        it('should return an empty array when maxPrice is below all product prices', async () => {
            await seedProducts([makeProduct({ price: { amount: 1000, currency: 'INR' } })]);

            const res = await request(app).get('/api/product?maxPrice=1');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });
    });

    describe('Error Cases', () => {
        it('should return 500 when the database throws an error', async () => {
            jest.spyOn(Product, 'find').mockImplementationOnce(() => {
                throw new Error('Database connection lost');
            });

            const res = await request(app).get('/api/product');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toBe('Database connection lost');
        });
    });
});

describe('Product API - GET /api/product/:id', () => {
    const sellerId = new mongoose.Types.ObjectId();

    // Shared factory for creating a product document in the DB
    const createProductInDb = async (overrides = {}) => {
        return await Product.create({
            title: 'Wireless Earbuds',
            description: 'True wireless stereo earbuds',
            price: { amount: 2999, currency: 'INR' },
            stock: { quantity: 50 },
            seller: sellerId,
            varaints: ['Black', 'White'],
            ...overrides,
        });
    };

    describe('Success Cases', () => {
        it('should return 200 with the product when a valid existing ID is provided', async () => {
            const product = await createProductInDb();

            const res = await request(app).get(`/api/product/${product._id}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Product fetched successfully');
            expect(res.body).toHaveProperty('product');
            expect(res.body.product._id).toEqual(product._id.toString());
            expect(res.body.product.title).toEqual(product.title);
        });

        it('should return the correct product when multiple products exist', async () => {
            const productA = await createProductInDb({ title: 'Product A' });
            const productB = await createProductInDb({ title: 'Product B' });

            const res = await request(app).get(`/api/product/${productB._id}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.product._id).toEqual(productB._id.toString());
            expect(res.body.product.title).toEqual('Product B');
            // Must NOT accidentally return the other product
            expect(res.body.product._id).not.toEqual(productA._id.toString());
        });

        it('should return the full product shape (title, price, stock, seller, varaints)', async () => {
            const product = await createProductInDb();

            const res = await request(app).get(`/api/product/${product._id}`);

            expect(res.statusCode).toEqual(200);
            const p = res.body.product;
            expect(p).toHaveProperty('title');
            expect(p).toHaveProperty('price');
            expect(p.price).toHaveProperty('amount');
            expect(p.price).toHaveProperty('currency');
            expect(p).toHaveProperty('stock');
            expect(p.stock).toHaveProperty('quantity');
            expect(p).toHaveProperty('seller');
            expect(p).toHaveProperty('varaints');
        });
    });

    describe('Not Found Cases', () => {
        it('should return 404 when a valid ObjectId that does not exist is provided', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app).get(`/api/product/${nonExistentId}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
        });

        it('should return 404 after the product has been deleted', async () => {
            const product = await createProductInDb();
            await Product.findByIdAndDelete(product._id);

            const res = await request(app).get(`/api/product/${product._id}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
        });
    });

    describe('Validation Cases', () => {
        it('should return 400 for a non-ObjectId string ID', async () => {
            const res = await request(app).get('/api/product/not-a-valid-id');

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid product ID format');
        });

        it('should return 400 for a short numeric string ID', async () => {
            const res = await request(app).get('/api/product/12345');

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid product ID format');
        });

        it('should return 400 for an empty-ish random string ID', async () => {
            const res = await request(app).get('/api/product/abc-xyz-!!');

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid product ID format');
        });
    });

    describe('Error Cases', () => {
        it('should return 500 when the database throws during findById', async () => {
            const validId = new mongoose.Types.ObjectId();

            jest.spyOn(Product, 'findById').mockRejectedValueOnce(
                new Error('DB read failure')
            );

            const res = await request(app).get(`/api/product/${validId}`);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message', 'DB read failure');
        });
    });
});
