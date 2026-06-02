const ImageKit = require('@imagekit/nodejs');
const crypto = require("crypto");

const imagekit = new ImageKit({
    publicKey:process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey:process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint:process.env.IMAGEKIT_URL_ENDPOINT
})

const uploadImages = async (files,folder="/cohort/products")=>{
    try {
        if(!Array.isArray(files) || files.length === 0){
            return [];
        }
        
        
        //uploading images together
        const uploadPromises = files.map((file)=>{
            return imagekit.files.upload({
                file: file.buffer.toString('base64'),
                fileName: crypto.randomUUID() + "-" + file.originalname,
                folder: folder,
            });
        });
        const uploadedImages = await Promise.all(uploadPromises);
        return uploadedImages;
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error("Error uploading images:", error);
        }
        throw error;
    }
}

module.exports = { uploadImages }

