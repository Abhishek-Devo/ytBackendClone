import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

// Function to generate access and refresh tokens for a given user
const generateAccessAndRefreshToken = async (userId) => {
  try {
    // Find the user by their unique ID in the database
    const user = await User.findById(userId);

    // If user is not found, throw an error
    if (!user) {
      throw new ApiError(404, "Failed to find the requested user");
    }

    // Generate access and refresh tokens using the user model methods
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Store the refresh token in the user document
    user.refreshToken = refreshToken;

    // Save the updated user data, but skip validation checks
    await User.save({ validateBeforeSave: false });

    // Return the generated tokens
    return { accessToken, refreshToken };
  } catch (error) {
    // If something goes wrong, throw an error
    throw new ApiError(500, "Failed to generate AccessToken and RefreshToken");
  }
};

// Function to handle user login
const loginUser = asyncHandler(async (req, res) => {
  // Extract email, username, and password from request body
  const { email, username, password } = req.body;

  // Validate that the necessary fields are provided
  if (!email || (!username && !password)) {
    throw new ApiError(400, "Username or email, with password is required");
  }

  // Check if a user exists in the database with the given email or username
  const user = await User.findOne({
    $or: [{ username }, { email }], // MongoDB operator to search for either username or email
  });

  // If user is not found, throw an error
  if (!user) {
    throw new ApiError(404, "Failed to find user");
  }

  // Validate the provided password with the stored password
  const isPasswordValid = await user.isPasswordCorrect(password);

  // If password is incorrect, throw an error
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  // Generate access and refresh tokens for the authenticated user
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  // Fetch the logged-in user details, but exclude sensitive fields like password and refreshToken
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // If unable to retrieve user details, throw an error
  if (!loggedInUser) {
    throw new ApiError(400, "Failed to get logged-in user");
  }

  // Cookie options for storing tokens securely
  const options = {
    // Prevents client-side JavaScript from accessing the cookies (for security reasons)
    httpOnly: true,

    // Ensures cookies are only sent over HTTPS in production mode
    secure: process.env.NODE_ENV === "production",
  };

  // Send response with cookies and user data
  return res
    .status(200)
    .cookie("accessToken", accessToken, options) // Store access token in a cookie
    .cookie("refreshToken", refreshToken, options) // Store refresh token in a cookie
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser, // Return user details (excluding password & refreshToken)
          accessToken, // Also return tokens in response body
          refreshToken,
        },
        "User logged in successfully" // Success message
      )
    );
});

const registerUser = asyncHandler(async (req, res) => {
  const { fullname, username, email, password } = req.body;

  //validation of incoming data , using simple trick
  if (
    [fullname, username, email, password].some(
      (arrayfield) => arrayfield?.trim() === "" //will ran for everyfield
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  //check user already exist or not in database
  const existedUser = await User.findOne({
    //using mongodb operators
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User already exist with this username or email");
  }

  //lets now handle images
  //console.log(req.files)
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverLocalPath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing...");
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
    avatar = await uploadOnCloudinary(avatarLocalPath);
    console.log("Uploaded avatar to CF", avatar.public_id);
  } catch (error) {
    console.log("Error uploading avatar", error);
    throw new ApiError(500, "failed uploading Avatar file ");
  }

  let coverImage;
  try {
    coverImage = await uploadOnCloudinary(coverLocalPath);
    console.log("Uploaded coverImage to CF", coverImage.public_id);
  } catch (error) {
    console.log("Error uploading coverImage", error);
    throw new ApiError(500, "failed uploading coverImage file ");
  }

  try {
    //lets create a user
    const user = await User.create({
      fullname,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      email,
      password,
      username: username.toLowerCase(),
    });

    //verifing user created on not by querying from database , except password,refreshtoken when getting response from db
    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    if (!createdUser) {
      throw new ApiError(
        500,
        "something went wrong while registering the user"
      );
    }

    return res
      .status(201)
      .json(new ApiResponse(201, createdUser, "User registered successfully"));
  } catch (error) {
    console.log("User creation failed");

    if (avatar) {
      await deleteFromCloudinary(avatar.public_id);
    }
    if (coverImage) {
      await deleteFromCloudinary(coverImage.public_id);
    }

    throw new ApiError(
      500,
      "Something went while registering user , uploaded image were deleted"
    );
  }
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  //decoding refreshToken
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "invalid refresh token");
    }
    //user is found,match with refreshtoken
    if (incomingRefreshToken !== user?.refreshtoken) {
      throw new ApiError(401, "invalid refresh token or expired refresh token");
    }

    //generate a new token and send it to user
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };
    const { accessToken, refreshtoken: newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshtoken: newRefreshToken,
          },
          "Access token refreshed successfuly"
        )
      );
  } catch (error) {
    throw new ApiError(500,"Server failed while refreshing access token");
  }
});

const logoutUser=asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set:{
        refreshToken:undefined
      }
    },{
      new:true //to return refresh information
    }
  )

  const options ={
    httpOnly:true,
    secure:process.env.NODE_ENV=="Production",
  }

  return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).json(new ApiResponse(200,{},"user logged out successfully")) //{} to show that no data we have 
})

const changeCurrentPassword=asyncHandler(async(req,res)=>{
  //grab the old password
  const {oldPassword,newPassword}=req.body

  //we need access of current user , we will get it from middleware
  const user=await User.findById(req.user?._id)

  //now we have access to oldPassword and current logged In user
  const isPasswordValid=await user.isPasswordCorrect(oldPassword) //returns boolean val

  if(!isPasswordValid){
    throw new ApiError(401,"invalid old password provided");
  }

  user.password = newPassword

  await user.save({validateBeforeSave:false})

  return res.status(200).json(new ApiResponse(200,{},"password updated successfully"));
})

const getCurrentUser=asyncHandler(async(req,res)=>{
  //in auth middleware we already have stored user in request 
  return res.status(200).json(new ApiResponse(200,req.user,"current user details"))
})

const updateAccountDetails=asyncHandler(async(req,res)=>{
  const {fullname,email}=req.body;

  if(!fullname && !email)
{
  throw new ApiError(400,"fullname and email are required")
}

//update details
const user=await User.findByIdAndUpdate(
  req.user._id,
  {
    //we want to set some parameters i.e. update fields 
    $set:{
      fullname,
      email:email
    }
  },
  {new:true}).select("-password -refreshToken")

  return res.status(200).json(new ApiResponse(200,user,"Account details updated successfully"));

})

const updateUserAvatar=asyncHandler(async(req,res)=>{
  //get the avatar image file from user
  const avatarLocalPath=req.file?.path
  if(!avatarLocalPath){
    throw new ApiError(400,"File is required")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(500,"Something went wrong while uploading avatar")
  }

  //update user url field in db for avatar
  const user=await User.findByIdAndUpdate(req.user?._id,{
      $set :{
        //set is a command
        avatar:avatar.url
      }
  },{new:true}).select("-password -refreshToken")

  res.status(200).json(new ApiError(200,user,"Avatar updated successfully"));
})

const updateUserCoverImage=asyncHandler(async(req,res)=>{
  //get the coverImage image file from user
  const coverImageLocalPath=req.file?.path //single file so req.file 
  if(!coverImageLocalPath){
    throw new ApiError(400,"coverImage is required")
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if(!coverImage.url){
    throw new ApiError(500,"Something went wrong while uploading coverImage")
  }

  //update user url field in db for avatar
  const user=await User.findByIdAndUpdate(req.user?._id,{
      $set :{
        //set is a command in mongodb
        coverImage:coverImage.url
      }
  },{new:true}).select("-password -refreshToken")

  res.status(200).json(new ApiError(200,user,"coverImage  updated successfully"));
})

export { registerUser, loginUser,logoutUser,refreshAccessToken,updateAccountDetails,updateUserCoverImage,changeCurrentPassword,updateUserAvatar,getCurrentUser};
