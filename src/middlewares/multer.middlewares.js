import multer from "multer";

//step-1 allow the disk storage 
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, './public/temp')
    },
    filename: function (req, file, cb) {
      //const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null,file.originalname)
    }
  })
  
  //we can import upload to export settings 
  export const upload = multer({ storage })