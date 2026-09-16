'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { CAPTAIN_STATUS } = require('../utils/constants');

const captainSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    vehicleType: { type: String, enum: ['bicycle', 'electric', 'motorcycle'], default: 'motorcycle' },
    vehiclePlate: { type: String, trim: true },
    avatarUrl: { type: String, default: '' },
    nationalId: { type: String, default: '', select: false },
    birthDate: { type: Date, default: null, select: false },
    idPhotoUrl: { type: String, default: '', select: false },
    selfieUrl: { type: String, default: '', select: false },
    createdVia: { type: String, enum: ['admin', 'app'], default: 'admin' },
    payoutWallets: {
      type: [{ category: { type: String, required: true }, number: { type: String, required: true, trim: true }, ownerName: { type: String, default: '', trim: true }, _id: false }],
      default: [],
    },
    status: { type: String, enum: Object.values(CAPTAIN_STATUS), default: CAPTAIN_STATUS.OFFLINE, index: true },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
      updatedAt: { type: Date, default: Date.now },
    },
    activeOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    activeOrdersCount: { type: Number, default: 0, min: 0 },
    deviceTokens: { type: [String], default: [] },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },
    settledCommission: { type: Number, default: 0 },
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

captainSchema.index({ currentLocation: '2dsphere' });

captainSchema.methods.setPassword = async function (plain) { this.passwordHash = await bcrypt.hash(plain, 10); };
captainSchema.methods.verifyPassword = function (plain) { return bcrypt.compare(plain, this.passwordHash); };

const Captain = mongoose.model('Captain', captainSchema);

const MAX_ACTIVE = parseInt(process.env.MAX_ORDERS_PER_CAPTAIN, 10) > 0
  ? parseInt(process.env.MAX_ORDERS_PER_CAPTAIN, 10)
  : 5;

/**
 * Smart Dispatch ranking. Lower score is better.
 * Distance remains the largest factor, but a slightly farther captain can win when
 * they have a much lighter workload, better rating, or fresher GPS position.
 */
Captain.smartDispatchCandidates = async function smartDispatchCandidates(
  coordinates,
  { maxKm = 10, excludeIds = [], limit = 20 } = {}
) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return [];
  const excluded = (excludeIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  const maxDistance = Math.max(1, Number(maxKm) || 10) * 1000;
  const geoQuery = {
    isApproved: true,
    status: { $in: [CAPTAIN_STATUS.ONLINE, CAPTAIN_STATUS.BUSY] },
    activeOrdersCount: { $lt: MAX_ACTIVE },
    ...(excluded.length ? { _id: { $nin: excluded } } : {}),
  };

  const rows = await Captain.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: coordinates.map(Number) },
        distanceField: 'distanceMeters',
        maxDistance,
        spherical: true,
        query: geoQuery,
      },
    },
    { $limit: Math.min(50, Math.max(5, Number(limit) || 20)) },
    { $project: { name: 1, phone: 1, vehicleType: 1, status: 1, rating: 1, ratingsCount: 1, activeOrdersCount: 1, currentLocation: 1, distanceMeters: 1 } },
  ]);

  const now = Date.now();
  return rows
    .map((row) => {
      const distanceKm = Number(row.distanceMeters || 0) / 1000;
      const distancePenalty = Math.min(1, distanceKm / Math.max(1, Number(maxKm) || 10));
      const loadPenalty = Math.min(1, Number(row.activeOrdersCount || 0) / MAX_ACTIVE);
      const rating = Math.max(0, Math.min(5, Number(row.rating || 0)));
      const ratingPenalty = 1 - rating / 5;
      const ageMin = Math.max(0, (now - new Date(row.currentLocation?.updatedAt || 0).getTime()) / 60000);
      const freshnessPenalty = Math.min(1, ageMin / 15);
      const score = Number((distancePenalty * 0.55 + loadPenalty * 0.25 + ratingPenalty * 0.15 + freshnessPenalty * 0.05).toFixed(4));
      return { ...row, distanceKm: Number(distanceKm.toFixed(2)), locationAgeMinutes: Math.round(ageMin), dispatchScore: score };
    })
    .filter((row) => row.locationAgeMinutes <= 30)
    .sort((a, b) => a.dispatchScore - b.dispatchScore || a.distanceKm - b.distanceKm);
};

// order.service historically calls Captain.findOne with a $near query. We intercept
// only that exact dispatch-shaped query so existing auto-assignment automatically uses
// the smart ranking; every normal Captain.findOne call keeps native Mongoose behavior.
const nativeFindOne = Captain.findOne.bind(Captain);
Captain.findOne = function smartAwareFindOne(conditions = {}, projection, options) {
  const near = conditions?.currentLocation?.$near;
  const isDispatchLookup = near && conditions?.isApproved === true && conditions?.activeOrder === null;
  if (!isDispatchLookup) return nativeFindOne(conditions, projection, options);

  const coords = near?.$geometry?.coordinates;
  const maxKm = Number(near?.$maxDistance || 10000) / 1000;
  const excludeIds = conditions?._id?.$nin || [];
  return Captain.smartDispatchCandidates(coords, { maxKm, excludeIds, limit: 20 })
    .then((rows) => rows[0] ? nativeFindOne({ _id: rows[0]._id }) : null);
};

module.exports = Captain;
