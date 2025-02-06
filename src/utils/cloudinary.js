//this file code is provided by cloudinary

import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

//configuring cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    //check file path provided or not, if not don't proceed further
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(
      localFilePath,
      //optional
      {
        resource_type: "auto", //autodetect the file type of incoming file
      }
    );
    console.log("file uploaded on cloudinary. file src : " + response.url);
    //delete file from our server once it successfully uploaded to cloudinary
    fs.unlinkSync(localFilePath)

    return response
  }
   catch (error) {
    //in case file not uploaded to cloudinary, remove file from our localstorage too.
    fs.unlinkSync(localFilePath);
    return null;
  }
};

export { uploadOnCloudinary };
