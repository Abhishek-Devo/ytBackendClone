import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js"
import {User} from "../models/user.models.js";
import {uploadOnCloudinary,deleteFromCloudinary} from "../utils/cloudinary.js"

const registerUser = asyncHandler(async (req, res) => {
  const { fullname,username,email, password } = req.body;

  //validation of incoming data , using simple trick
  if (
    [fullname, username, email, password].some(
      (arrayfield) => arrayfield?.trim() === "" //will ran for everyfield
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  //check user already exist or not in database
  const existedUser = await User.findOne({ //using mongodb operators
    $or:[{username},{email}]
  })

  if(existedUser) {
    throw new ApiError(409,"User already exist with this username or email")
  }

  //lets now handle images 
  //console.log(req.files)
 const avatarLocalPath= req.files?.avatar?.[0]?.path
 const coverLocalPath = req.files?.coverImage?.[0]?.path

 if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is missing...")
 }

 //if avatar image is provided upload it on cloudinary
 /*
 const avatar=await uploadOnCloudinary(avatarLocalPath)

 let coverImage=""
 if(coverLocalPath){
    coverImage=await uploadOnCloudinary(coverLocalPath)
 }
    */

//  refractoring above code
 let avatar;
 try {
    avatar = await uploadOnCloudinary(avatarLocalPath)
    console.log("Uploaded avatar to CF",avatar.public_id)
 } catch (error) {
    console.log("Error uploading avatar",error)
    throw new ApiError(500,"failed uploading Avatar file ")
 }

 let coverImage;
 try {
    coverImage = await uploadOnCloudinary(coverLocalPath)
    console.log("Uploaded coverImage to CF",coverImage.public_id)
 } catch (error) {
    console.log("Error uploading coverImage",error)
    throw new ApiError(500,"failed uploading coverImage file ")
 }

 try {
    //lets create a user
    const user = await User.create({
       fullname,
       avatar:avatar.url,
       coverImage:coverImage?.url || "",
       email,
       password,
       username:username.toLowerCase()
    })
   
    //verifing user created on not by querying from database , except password,refreshtoken when getting response from db
    const createdUser=await User.findById(user._id).select(
       "-password -refreshToken"
    )
   
    if(!createdUser){
       throw new ApiError(500,"something went wrong while registering the user")
    }
   
    return res
       .status(201)
       .json(new ApiResponse(201,createdUser,"User registered successfully"))
} catch (error) {
    console.log("User creation failed")

    if(avatar){
        await deleteFromCloudinary(avatar.public_id)
    }
    if(coverImage){
        await deleteFromCloudinary(coverImage.public_id)
    }

    throw new ApiError(500,"Something went while registering user , uploaded image were deleted")
 }
})

export { registerUser };
