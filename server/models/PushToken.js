const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PushToken = sequelize.define('PushToken', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    device_os: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  }, {
    tableName: 'push_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return PushToken;
};