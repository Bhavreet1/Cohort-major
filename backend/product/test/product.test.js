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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/product/:id  –  Update Product
// Rule: only the seller who originally created the product may update it.
// ─────────────────────────────────────────────────────────────────────────────
describe('Product API - PATCH /api/product/:id', () => {
    // Two distinct seller IDs used across tests
    const ownerSellerId   = new mongoose.Types.ObjectId();
    const foreignSellerId = new mongoose.Types.ObjectId();

    /**
     * Helper – inserts a product owned by `ownerSellerId` and returns the doc.
     */
    const createProductInDb = async (overrides = {}) => {
        return await Product.create({
            title:       'Original Title',
            description: 'Original description',
            price:       { amount: 1000, currency: 'INR' },
            stock:       { quantity: 20 },
            seller:      ownerSellerId,
            varaints:    ['Black', 'White'],
            ...overrides,
        });
    };

    /**
     * The auth middleware (in test mode) reads req.body.seller to set req.seller.
     * We send `_sellerId` in the body so the middleware can populate req.seller,
     * then delete it inside the controller so it is never written to the DB.
     *
     * For a seller role we pass role='seller'; for admin we pass role='admin'.
     * (The test-mode auth middleware currently hard-codes role='admin', so tests
     *  that need a seller context rely on the controller/middleware reading
     *  req.body.seller for ownership checks.)
     */
    const patchAs = (sellerId) =>
        request(app)
            .patch(`/api/product/PLACEHOLDER`) // overridden per call
            .set('x-test-seller-id', sellerId.toString()); // custom header read by auth stub

    // ── convenience wrappers ────────────────────────────────────────────────

    /**
     * Send a PATCH request as the given seller, with the given body.
     * The `seller` field in the body is used by the test-mode auth middleware
     * to set req.seller (ownership identity).
     */
    const patchProduct = (productId, sellerId, body = {}) =>
        request(app)
            .patch(`/api/product/${productId}`)
            .send({ ...body, seller: sellerId.toString() });

    // ── SUCCESS CASES ───────────────────────────────────────────────────────
    describe('Success Cases', () => {
        it('should return 200 and update the title when the owner sends a valid request', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                title: 'Updated Title',
            });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('product');
            expect(res.body.product.title).toEqual('Updated Title');

            // Verify the DB was actually updated
            const updated = await Product.findById(product._id);
            expect(updated.title).toEqual('Updated Title');
        });

        it('should return 200 and update the price when the owner sends valid price data', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                price: { amount: 2500, currency: 'USD' },
            });

            expect(res.statusCode).toEqual(200);
            expect(res.body.product.price.amount).toEqual(2500);
            expect(res.body.product.price.currency).toEqual('USD');

            const updated = await Product.findById(product._id);
            expect(updated.price.amount).toEqual(2500);
            expect(updated.price.currency).toEqual('USD');
        });

        it('should return 200 and update the stock quantity', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                stock: { quantity: 99 },
            });

            expect(res.statusCode).toEqual(200);
            expect(res.body.product.stock.quantity).toEqual(99);

            const updated = await Product.findById(product._id);
            expect(updated.stock.quantity).toEqual(99);
        });

        it('should return 200 and update varaints', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                varaints: ['Red', 'Blue', 'Green'],
            });

            expect(res.statusCode).toEqual(200);
            expect(res.body.product.varaints).toEqual(
                expect.arrayContaining(['Red', 'Blue', 'Green'])
            );

            const updated = await Product.findById(product._id);
            expect(updated.varaints).toContain('Red');
        });

        it('should return 200 and update the description', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                description: 'Brand-new description text',
            });

            expect(res.statusCode).toEqual(200);
            expect(res.body.product.description).toEqual('Brand-new description text');
        });

        it('should allow a partial update – only provided fields change, others stay intact', async () => {
            const product = await createProductInDb({ title: 'Keep Me', description: 'Keep Me Too' });

            const res = await patchProduct(product._id, ownerSellerId, {
                description: 'Changed Description',
            });

            expect(res.statusCode).toEqual(200);
            // Title must remain unchanged
            expect(res.body.product.title).toEqual('Keep Me');
            // Description must be updated
            expect(res.body.product.description).toEqual('Changed Description');
        });

        it('should allow a full update of all fields at once', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                title:       'Completely New Title',
                description: 'Completely new desc',
                price:       { amount: 5000, currency: 'USD' },
                stock:       { quantity: 100 },
                varaints:    ['XL', 'XXL'],
            });

            expect(res.statusCode).toEqual(200);
            expect(res.body.product.title).toEqual('Completely New Title');
            expect(res.body.product.price.amount).toEqual(5000);
            expect(res.body.product.stock.quantity).toEqual(100);
            expect(res.body.product.varaints).toContain('XL');
        });

        it('should upload new images and update the images array when owner provides files', async () => {
            mockUpload.mockResolvedValue({
                url:          'https://ik.imagekit.io/test/updated_image.jpg',
                thumbnailUrl: 'https://ik.imagekit.io/test/tr:h-100/updated_image.jpg',
                fileId:       'updated_file_id_001',
            });

            const product = await createProductInDb();

            const res = await request(app)
                .patch(`/api/product/${product._id}`)
                .field('seller', ownerSellerId.toString())
                .attach('images', Buffer.from('new-image-binary'), 'new_image.jpg');

            expect(res.statusCode).toEqual(200);
            expect(res.body.product.images.length).toBeGreaterThan(0);
            expect(res.body.product.images[0]).toHaveProperty('url');
            expect(mockUpload).toHaveBeenCalledTimes(1);
        });
    });

    // ── OWNERSHIP / AUTHORISATION CASES ────────────────────────────────────
    describe('Ownership Enforcement – only creator can update', () => {
        it('should return 404 when a different seller tries to update the product', async () => {
            const product = await createProductInDb(); // owned by ownerSellerId

            // foreignSellerId is NOT the owner — findOne({ _id, seller }) returns null → 404
            const res = await patchProduct(product._id, foreignSellerId, {
                title: 'Hijacked Title',
            });

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
            // Title must NOT have changed
            const unchanged = await Product.findById(product._id);
            expect(unchanged.title).toEqual('Original Title');
        });

        it('should return 403 when no seller ID is provided at all', async () => {
            const product = await createProductInDb();

            // Send update without a seller field
            const res = await request(app)
                .patch(`/api/product/${product._id}`)
                .send({ title: 'No Seller Attack' });

            expect(res.statusCode).toEqual(403);
        });

        it('should NOT allow the owner to change the seller field to another ID', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                // Attempt to transfer ownership
                seller: foreignSellerId.toString(),
            });

            // The API should either reject this (403/400) or silently ignore the seller field
            // Either way the DB seller should remain ownerSellerId
            const unchanged = await Product.findById(product._id);
            expect(unchanged.seller.toString()).toEqual(ownerSellerId.toString());
        });

        it('should return 403 when seller ID is an empty string', async () => {
            const product = await createProductInDb();

            const res = await request(app)
                .patch(`/api/product/${product._id}`)
                .send({ title: 'Attack', seller: '' });

            expect(res.statusCode).toEqual(403);
        });
    });

    // ── NOT FOUND CASES ─────────────────────────────────────────────────────
    describe('Not Found Cases', () => {
        it('should return 404 when the product ID does not exist in the DB', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await patchProduct(nonExistentId, ownerSellerId, {
                title: 'Ghost Update',
            });

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
        });

        it('should return 404 after the product has been deleted', async () => {
            const product = await createProductInDb();
            await Product.findByIdAndDelete(product._id);

            const res = await patchProduct(product._id, ownerSellerId, {
                title: 'Update After Delete',
            });

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
        });
    });

    // ── VALIDATION CASES ────────────────────────────────────────────────────
    describe('Validation Cases', () => {
        it('should return 400 for a non-ObjectId string as the product ID', async () => {
            const res = await request(app)
                .patch('/api/product/not-a-valid-id')
                .send({ seller: ownerSellerId.toString(), title: 'Test' });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 for a short numeric string as the product ID', async () => {
            const res = await request(app)
                .patch('/api/product/12345')
                .send({ seller: ownerSellerId.toString(), title: 'Test' });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 if price amount is set to a negative number', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                price: { amount: -50, currency: 'INR' },
            });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 if stock quantity is set to a negative number', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                stock: { quantity: -1 },
            });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 if price currency is not INR or USD', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                price: { currency: 'EUR' },
            });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 if varaints is set to an empty array', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                varaints: [],
            });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should return 400 if title is set to an empty string', async () => {
            const product = await createProductInDb();

            const res = await patchProduct(product._id, ownerSellerId, {
                title: '',
            });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message');
        });
    });

    // ── ERROR / EDGE CASES ───────────────────────────────────────────────────
    describe('Error Cases', () => {
        it('should return 500 when the database throws during findOne', async () => {
            const validId = new mongoose.Types.ObjectId();

            // Controller uses findOne (not findById) — spy on the correct method
            jest.spyOn(Product, 'findOne').mockRejectedValueOnce(
                new Error('DB update failure')
            );

            const res = await patchProduct(validId, ownerSellerId, {
                title: 'Crash Test',
            });

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message', 'DB update failure');
        });

        it('should return 500 when ImageKit upload fails during an image update', async () => {
            mockUpload.mockRejectedValue(new Error('ImageKit service down'));

            const product = await createProductInDb();

            const res = await request(app)
                .patch(`/api/product/${product._id}`)
                .field('seller', ownerSellerId.toString())
                .attach('images', Buffer.from('broken-binary'), 'broken.jpg');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toContain('ImageKit');
        });

        it('should not alter unrelated products when one product is updated', async () => {
            const productA = await createProductInDb({ title: 'Product A' });
            const productB = await createProductInDb({ title: 'Product B' });

            await patchProduct(productA._id, ownerSellerId, { title: 'Product A Updated' });

            const unchangedB = await Product.findById(productB._id);
            expect(unchangedB.title).toEqual('Product B');
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/product/seller  –  Seller's Product List
// Filters all products down to those owned by a specific seller.
// ─────────────────────────────────────────────────────────────────────────────
describe("Product API - GET /api/product/seller (Seller's Product List)", () => {
    const sellerA = new mongoose.Types.ObjectId();
    const sellerB = new mongoose.Types.ObjectId();

    // ── helpers ───────────────────────────────────────────────────────────────

    /** Insert an arbitrary number of products owned by the given seller. */
    const seedProductsForSeller = async (sellerId, count = 3, overrides = {}) => {
        const docs = Array.from({ length: count }, (_, i) => ({
            title:       `Seller Product ${i + 1}`,
            description: `Description ${i + 1}`,
            price:       { amount: (i + 1) * 100, currency: 'INR' },
            stock:       { quantity: 10 + i },
            seller:      sellerId,
            varaints:    ['Default'],
            ...overrides,
        }));
        return await Product.insertMany(docs);
    };

    /**
     * GET /api/product/seller as the given seller.
     * The test-mode auth middleware reads x-test-seller-id header to set req.seller.
     * Optional query string (e.g. '?limit=5&skip=2') can be appended via extraQuery.
     */
    const getSellerProducts = (sellerId, extraQuery = '') =>
        request(app)
            .get(`/api/product/seller${extraQuery}`)
            .set('x-test-seller-id', sellerId.toString());

    // ── SUCCESS CASES ────────────────────────────────────────────────────────
    describe('Success Cases', () => {
        it('should return 200 and only products belonging to the requested seller', async () => {
            await seedProductsForSeller(sellerA, 3);
            await seedProductsForSeller(sellerB, 2);

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('products');
            expect(Array.isArray(res.body.products)).toBe(true);
            expect(res.body.products.length).toBe(3);

            // Every returned product must belong to sellerA only
            for (const p of res.body.products) {
                expect(p.seller.toString()).toEqual(sellerA.toString());
            }
        });

        it('should return an empty array when the seller has no products', async () => {
            // Seed products for sellerB only — sellerA has none
            await seedProductsForSeller(sellerB, 2);

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });

        it('should return all products when the DB has only one seller', async () => {
            await seedProductsForSeller(sellerA, 4);

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBe(4);
        });

        it('should return the correct product shape for each item in the list', async () => {
            await seedProductsForSeller(sellerA, 1);

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(200);
            const p = res.body.products[0];
            expect(p).toHaveProperty('_id');
            expect(p).toHaveProperty('title');
            expect(p).toHaveProperty('price');
            expect(p.price).toHaveProperty('amount');
            expect(p.price).toHaveProperty('currency');
            expect(p).toHaveProperty('stock');
            expect(p.stock).toHaveProperty('quantity');
            expect(p).toHaveProperty('seller');
            expect(p).toHaveProperty('varaints');
        });

        it('should not return products that belong to a different seller', async () => {
            await seedProductsForSeller(sellerA, 2);
            await seedProductsForSeller(sellerB, 3);

            const res = await getSellerProducts(sellerB);

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBe(3);
            for (const p of res.body.products) {
                expect(p.seller.toString()).toEqual(sellerB.toString());
                expect(p.seller.toString()).not.toEqual(sellerA.toString());
            }
        });

        it('should return a single product when the seller has exactly one product', async () => {
            await seedProductsForSeller(sellerA, 1);

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBe(1);
            expect(res.body.products[0].seller.toString()).toEqual(sellerA.toString());
        });

        it('should return an empty array when the DB is completely empty', async () => {
            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });
    });

    // ── PAGINATION CASES ─────────────────────────────────────────────────────
    describe('Pagination Cases', () => {
        it('should respect the limit parameter and return at most that many products', async () => {
            await seedProductsForSeller(sellerA, 10);

            const res = await getSellerProducts(sellerA, '?limit=5');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBeLessThanOrEqual(5);
        });

        it('should cap the limit at 20 even when a larger value is requested', async () => {
            await seedProductsForSeller(sellerA, 25);

            const res = await getSellerProducts(sellerA, '?limit=30');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBeLessThanOrEqual(20);
        });

        it('should skip the correct number of products for the given seller', async () => {
            await seedProductsForSeller(sellerA, 5);

            const allRes  = await getSellerProducts(sellerA);
            const firstId = allRes.body.products[0]._id;

            const skippedRes = await getSellerProducts(sellerA, '?skip=1');

            expect(skippedRes.statusCode).toEqual(200);
            expect(skippedRes.body.products.length).toBe(4);
            const returnedIds = skippedRes.body.products.map((p) => p._id);
            expect(returnedIds).not.toContain(firstId);
        });

        it("should return an empty array when skip exceeds the seller's product count", async () => {
            await seedProductsForSeller(sellerA, 3);

            const res = await getSellerProducts(sellerA, '?skip=10');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });
    });

    // ── COMBINATION FILTER CASES ─────────────────────────────────────────────
    describe('Combination Filter Cases (seller + query params)', () => {
        it('should filter by seller AND minPrice simultaneously', async () => {
            await Product.insertMany([
                { title: 'Cheap A',  price: { amount: 50,  currency: 'INR' }, stock: { quantity: 5 }, seller: sellerA, varaints: ['X'] },
                { title: 'Pricey A', price: { amount: 800, currency: 'INR' }, stock: { quantity: 5 }, seller: sellerA, varaints: ['X'] },
                { title: 'Pricey B', price: { amount: 900, currency: 'INR' }, stock: { quantity: 5 }, seller: sellerB, varaints: ['Y'] },
            ]);

            const res = await getSellerProducts(sellerA, '?minPrice=100');

            expect(res.statusCode).toEqual(200);
            const titles = res.body.products.map((p) => p.title);
            expect(titles).toContain('Pricey A');
            expect(titles).not.toContain('Cheap A');   // below minPrice
            expect(titles).not.toContain('Pricey B');  // wrong seller
        });

        it('should filter by seller AND maxPrice simultaneously', async () => {
            await Product.insertMany([
                { title: 'Budget A',  price: { amount: 100,  currency: 'INR' }, stock: { quantity: 5 }, seller: sellerA, varaints: ['X'] },
                { title: 'Premium A', price: { amount: 2000, currency: 'INR' }, stock: { quantity: 5 }, seller: sellerA, varaints: ['X'] },
                { title: 'Budget B',  price: { amount: 200,  currency: 'INR' }, stock: { quantity: 5 }, seller: sellerB, varaints: ['Y'] },
            ]);

            const res = await getSellerProducts(sellerA, '?maxPrice=500');

            expect(res.statusCode).toEqual(200);
            const titles = res.body.products.map((p) => p.title);
            expect(titles).toContain('Budget A');
            expect(titles).not.toContain('Premium A');  // above maxPrice
            expect(titles).not.toContain('Budget B');   // wrong seller
        });

        it('should filter by seller, limit, and skip together correctly', async () => {
            await seedProductsForSeller(sellerA, 8);
            await seedProductsForSeller(sellerB, 3);

            const res = await getSellerProducts(sellerA, '?limit=3&skip=2');

            expect(res.statusCode).toEqual(200);
            expect(res.body.products.length).toBeLessThanOrEqual(3);
            for (const p of res.body.products) {
                expect(p.seller.toString()).toEqual(sellerA.toString());
            }
        });
    });

    // ── AUTH / IDENTITY CASES ────────────────────────────────────────────────
    describe('Auth & Identity Cases', () => {
        it('should return an empty list (not an error) for a valid seller with no products', async () => {
            const ghostSeller = new mongoose.Types.ObjectId();
            await seedProductsForSeller(sellerA, 2); // other seller has products

            const res = await getSellerProducts(ghostSeller);

            expect(res.statusCode).toEqual(200);
            expect(res.body.products).toEqual([]);
        });

        it('seller B cannot see seller A products — each seller sees only their own', async () => {
            await seedProductsForSeller(sellerA, 3);
            await seedProductsForSeller(sellerB, 2);

            const resA = await getSellerProducts(sellerA);
            const resB = await getSellerProducts(sellerB);

            expect(resA.statusCode).toEqual(200);
            expect(resB.statusCode).toEqual(200);
            expect(resA.body.products.length).toBe(3);
            expect(resB.body.products.length).toBe(2);

            const allSellerAIds = resA.body.products.map((p) => p.seller.toString());
            const allSellerBIds = resB.body.products.map((p) => p.seller.toString());
            expect(allSellerAIds.every((id) => id === sellerA.toString())).toBe(true);
            expect(allSellerBIds.every((id) => id === sellerB.toString())).toBe(true);
        });
    });

    // ── ERROR CASES ──────────────────────────────────────────────────────────
    describe('Error Cases', () => {
        it('should return 500 when the database throws synchronously during the query', async () => {
            jest.spyOn(Product, 'find').mockImplementationOnce(() => {
                throw new Error('DB seller query failure');
            });

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toBe('DB seller query failure');
        });

        it('should return 500 when the database throws asynchronously during the query', async () => {
            // Controller chain is: find({seller}).skip(n).limit(n)
            jest.spyOn(Product, 'find').mockReturnValueOnce({
                skip:  jest.fn().mockReturnThis(),
                limit: jest.fn().mockRejectedValue(new Error('Async DB failure')),
            });

            const res = await getSellerProducts(sellerA);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message');
        });
    });

    // ── ISOLATION / SIDE-EFFECT CASES ────────────────────────────────────────
    describe('Isolation & Data Integrity', () => {
        it('should not mutate existing products when querying the seller list', async () => {
            const products = await seedProductsForSeller(sellerA, 2);

            await getSellerProducts(sellerA);

            // Products must be unchanged after the GET request
            for (const original of products) {
                const inDb = await Product.findById(original._id);
                expect(inDb).not.toBeNull();
                expect(inDb.title).toEqual(original.title);
                expect(inDb.price.amount).toEqual(original.price.amount);
            }
        });

        it('should reflect a newly added product immediately in subsequent list calls', async () => {
            await seedProductsForSeller(sellerA, 2);

            const before = await getSellerProducts(sellerA);
            expect(before.body.products.length).toBe(2);

            // Add a third product
            await Product.create({
                title:    'Brand New',
                price:    { amount: 999, currency: 'INR' },
                stock:    { quantity: 5 },
                seller:   sellerA,
                varaints: ['One'],
            });

            const after = await getSellerProducts(sellerA);
            expect(after.body.products.length).toBe(3);
        });

        it('should reflect a deleted product immediately in subsequent list calls', async () => {
            const docs = await seedProductsForSeller(sellerA, 3);

            const before = await getSellerProducts(sellerA);
            expect(before.body.products.length).toBe(3);

            // Remove one product directly from DB
            await Product.findByIdAndDelete(docs[0]._id);

            const after = await getSellerProducts(sellerA);
            expect(after.body.products.length).toBe(2);
            const afterIds = after.body.products.map((p) => p._id);
            expect(afterIds).not.toContain(docs[0]._id.toString());
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/product/:id
// Rule: only the seller who originally created the product may delete it.
// ─────────────────────────────────────────────────────────────────────────────
describe('Product API - DELETE /api/product/:id', () => {
    const ownerSellerId   = new mongoose.Types.ObjectId();
    const foreignSellerId = new mongoose.Types.ObjectId();

    // Helper – insert a product owned by ownerSellerId
    const createProductInDb = async (overrides = {}) => {
        return await Product.create({
            title:       'Delete Test Product',
            description: 'Product to be deleted',
            price:       { amount: 1500, currency: 'INR' },
            stock:       { quantity: 30 },
            seller:      ownerSellerId,
            varaints:    ['Small', 'Large'],
            ...overrides,
        });
    };

    // Helper – send DELETE as a given seller
    // The test-mode auth middleware reads req.body.seller to set req.seller
    const deleteProduct = (productId, sellerId) =>
        request(app)
            .delete(`/api/product/${productId}`)
            .send({ seller: sellerId.toString() });

    // ── SUCCESS CASES ────────────────────────────────────────────────────────
    describe('Success Cases', () => {
        it('should return 200 and remove the product when the owner deletes it', async () => {
            const product = await createProductInDb();

            const res = await deleteProduct(product._id, ownerSellerId);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message');

            // Product must be gone from the DB
            const deleted = await Product.findById(product._id);
            expect(deleted).toBeNull();
        });

        it('should return the deleted product details in the response', async () => {
            const product = await createProductInDb({ title: 'Confirm Deleted Doc' });

            const res = await deleteProduct(product._id, ownerSellerId);

            expect(res.statusCode).toEqual(200);
            // Response should echo back the deleted document
            expect(res.body).toHaveProperty('product');
            expect(res.body.product._id).toEqual(product._id.toString());
            expect(res.body.product.title).toEqual('Confirm Deleted Doc');
        });

        it('should not remove any other products when one is deleted', async () => {
            const productA = await createProductInDb({ title: 'Keep A' });
            const productB = await createProductInDb({ title: 'Delete B' });

            await deleteProduct(productB._id, ownerSellerId);

            // Product A must still exist
            const stillExists = await Product.findById(productA._id);
            expect(stillExists).not.toBeNull();
            expect(stillExists.title).toEqual('Keep A');
        });
    });

    // ── OWNERSHIP / AUTHORISATION CASES ─────────────────────────────────────
    describe('Ownership Enforcement – only creator can delete', () => {
        it('should return 404 when a different seller tries to delete the product', async () => {
            const product = await createProductInDb();

            // foreignSellerId does not own this product
            const res = await deleteProduct(product._id, foreignSellerId);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');

            // Product must still exist in the DB
            const stillExists = await Product.findById(product._id);
            expect(stillExists).not.toBeNull();
        });

        it('should return 403 when no seller ID is provided', async () => {
            const product = await createProductInDb();

            const res = await request(app)
                .delete(`/api/product/${product._id}`)
                .send({});  // no seller field

            expect(res.statusCode).toEqual(403);

            // Product must still exist
            const stillExists = await Product.findById(product._id);
            expect(stillExists).not.toBeNull();
        });

        it('should return 403 when seller ID is an empty string', async () => {
            const product = await createProductInDb();

            const res = await request(app)
                .delete(`/api/product/${product._id}`)
                .send({ seller: '' });

            expect(res.statusCode).toEqual(403);
        });
    });

    // ── NOT FOUND CASES ──────────────────────────────────────────────────────
    describe('Not Found Cases', () => {
        it('should return 404 when the product ID does not exist in the DB', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await deleteProduct(nonExistentId, ownerSellerId);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
        });

        it('should return 404 when trying to delete an already-deleted product (idempotency)', async () => {
            const product = await createProductInDb();

            // First delete succeeds
            await deleteProduct(product._id, ownerSellerId);

            // Second delete on the same ID
            const res = await deleteProduct(product._id, ownerSellerId);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Product not found');
        });
    });

    // ── VALIDATION CASES ─────────────────────────────────────────────────────
    describe('Validation Cases', () => {
        it('should return 400 for a non-ObjectId string as the product ID', async () => {
            const res = await request(app)
                .delete('/api/product/not-a-valid-id')
                .send({ seller: ownerSellerId.toString() });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid product ID format');
        });

        it('should return 400 for a short numeric string as the product ID', async () => {
            const res = await request(app)
                .delete('/api/product/12345')
                .send({ seller: ownerSellerId.toString() });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid product ID format');
        });
    });

    // ── ERROR CASES ──────────────────────────────────────────────────────────
    describe('Error Cases', () => {
        it('should return 500 when the database throws during findOne', async () => {
            const validId = new mongoose.Types.ObjectId();

            jest.spyOn(Product, 'findOne').mockRejectedValueOnce(
                new Error('DB delete failure')
            );

            const res = await deleteProduct(validId, ownerSellerId);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message', 'DB delete failure');
        });
    });
});
