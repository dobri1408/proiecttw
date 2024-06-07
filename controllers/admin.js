const Product = require("../models/product");
const { validationResult } = require("express-validator");
const path = require("path");
const streamifier = require("streamifier");
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const admin = require("firebase-admin");

const serviceAccount = require("./proeict-8f5bd-firebase-adminsdk-zvrsx-3cd6cf74e9.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gs://proeict-8f5bd.appspot.com",
});

const bucket = admin.storage().bucket();

exports.getAddProduct = (req, res, next) => {
  if (!req.session.isLoggedIn) {
    return res.redirect("/login");
  }
  res.render("admin/edit-product", {
    pageTitle: "Add Product",
    path: "/admin/add-product",
    editing: false,
    hasError: false,
    errorMessage: [],
    validationErrors: [],
  });
};

async function streamUpload(req) {
  if (!req.file) throw new Error("No file uploaded.");

  const blob = bucket.file(req.file.originalname);
  const blobStream = blob.createWriteStream({
    metadata: { contentType: req.file.mimetype },
  });

  return new Promise((resolve, reject) => {
    blobStream.on("error", (error) =>
      reject(new Error(`Upload error: ${error.message}`))
    );
    blobStream.on("finish", async () => {
      try {
        await blob.makePublic();
        const file = bucket.file(req.file.originalname);
        await file.makePublic();
        const [metadata] = await file.getMetadata();

        if (metadata && metadata.mediaLink) {
          resolve(metadata.mediaLink); // This is the direct link to access the file
        }
      } catch (error) {
        reject(new Error(`Error making file public: ${error.message}`));
      }
    });
    blobStream.end(req.file.buffer);
  });
}
exports.postAddProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Add Product",
      path: "/admin/add-product",
      editing: false,
      hasError: true,
      product: {
        title: req.body.title,
        price: req.body.price,
        description: req.body.description,
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }

  try {
    const imageUrl = await streamUpload(req);
    const product = new Product({
      title: req.body.title,
      price: req.body.price,
      description: req.body.description,
      imageUrl: imageUrl,
      userId: req.user,
    });

    await product.save();
    console.log("Created Product");
    res.redirect("/admin/products");
  } catch (err) {
    console.error("Error during product creation:", err);
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};
exports.getEditProduct = (req, res, next) => {
  const editMode = req.query.edit;
  // console.log(editMode);
  if (!editMode) {
    return res.redirect("/");
  }
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      if (!product) {
        return res.redirect("/");
      }
      res.render("admin/edit-product", {
        pageTitle: "Edit Product",
        path: "/admin/edit-product",
        editing: editMode,
        product: product,
        hasError: false,
        errorMessage: [],
        validationErrors: [],
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postEditProduct = async (req, res, next) => {
  const prodId = req.body.productId;
  const updatedTitle = req.body.title;
  const updatedPrice = req.body.price;
  const image = req.file;
  const updatedDesc = req.body.description;
  const errors = validationResult(req);

  let newImageURL;

  if (!errors.isEmpty()) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Edit Product",
      path: "/admin/edit-product",
      editing: true,
      hasError: true,
      product: {
        title: updatedTitle,

        price: updatedPrice,
        description: updatedDesc,
        _id: prodId,
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }

  if (image) {
    newImageURL = await streamUpload(req);
  } else {
    Product.findById(prodId).then((product) => {
      newImageURL = product.imageUrl;
    });
  }

  // Uploading File to cloudinary

  /////////////////////////////////////////////////////////////////////

  Product.findById(prodId)
    .then((product) => {
      if (product.userId.toString() !== req.user._id.toString()) {
        return res.redirect("/");
      }
      //product is a mongoose object that has its own special methods/properties
      product.title = updatedTitle;
      product.price = updatedPrice;
      product.description = updatedDesc;
      product.imageUrl = newImageURL;

      return product.save().then((result) => {
        console.log("UPDATED PRODUCT");
        res.redirect("/admin/products");
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProducts = (req, res, next) => {
  Product.find({ userId: req.user._id })
    .then((products) => {
      res.render("admin/products", {
        prods: products,
        pageTitle: "Admin Products",
        path: "/admin/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.deleteProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      if (!product) {
        return next(new Error("Product not found."));
      }
    })
    .then((result) => {
      console.log("edit and delete success", result);
      return Product.deleteOne({ _id: prodId, userId: req.user._id });
    })
    .then(() => {
      console.log("DESTROYED PRODUCT");
      res.status(200).json({ message: "Success!" });
    })
    .catch((err) => {
      res.status(500).json({ message: "Deleting product failed!" });
    });
};
