import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

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
   const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
 
   // Fetch the logged-in user details, but exclude sensitive fields like password and refreshToken
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
 
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

export { registerUser, loginUser };
