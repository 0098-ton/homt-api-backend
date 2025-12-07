import mongoose from 'mongoose';

const trafficPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    trafficAmount: {
      type: Number, // in bytes
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    validityDays: {
      type: Number, // How many days from purchase the package is valid
      default: 30,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model('TrafficPackage', trafficPackageSchema);
