const { Schema, model } = require("mongoose");

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    // Hanya dua peran: pembaca biasa dan admin pengelola perpustakaan.
    role: { type: String, enum: ["user", "admin"], default: "user" },
    namaLengkap: { type: String, default: "", trim: true },
    fotoProfil: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 300 },
    instagramUrl: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    // Diganti saat password berubah; token lama otomatis tidak berlaku.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

UserSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    username: this.username,
    namaLengkap: this.namaLengkap,
    fotoProfil: this.fotoProfil,
    bio: this.bio,
    instagramUrl: this.instagramUrl,
    linkedinUrl: this.linkedinUrl,
    role: this.role,
    createdAt: this.createdAt,
  };
};

UserSchema.methods.toSelf = function toSelf() {
  return { ...this.toPublic(), email: this.email };
};

module.exports = model("User", UserSchema);
