'use strict';

const mongoose = require('mongoose');

const restaurantRatingSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stars: { type: Number, required: true, min: 1, max: 5 },
  },
  { timestamps: true }
);

restaurantRatingSchema.index({ restaurant: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('RestaurantRating', restaurantRatingSchema);
