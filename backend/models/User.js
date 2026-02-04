const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide your name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: function () {
      return !this.googleId && !this.githubId;
    },
    minlength: 8,
    select: false
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  githubId: {
    type: String,
    unique: true,
    sparse: true
  },
  bio: {
    type: String,
    default: '',
    maxlength: 500
  },
  profilePicture: {
    type: String,
    default: 'https://as1.ftcdn.net/v2/jpg/06/33/54/78/1000_F_633547842_AugYzexTpMJ9z1YcpTKUBoqBF0CUCk10.jpg'
  },
  bannerUrl: {
    type: String,
    default: ''
  },
  skills: [{
    type: String,
    trim: true
  }],
  githubUrl: {
    type: String,
    validate: {
      validator: function (value) {
        return !value || validator.isURL(value);
      },
      message: 'Please provide a valid URL'
    }
  },
  projects: [{
    title: {
      type: String,
      required: true
    },
    description: String,
    link: String,
    image: String
  }],
  linkedinUrl: {
    type: String,
    validate: {
      validator: function (value) {
        return !value || validator.isURL(value);
      },
      message: 'Please provide a valid URL'
    }
  },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Only run this function if password was modified
  if (!this.isModified('password') || !this.password) return next();

  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to check if password is correct
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

const User = mongoose.model('User', userSchema);

module.exports = User;