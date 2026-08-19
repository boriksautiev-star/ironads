const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendVerificationEmail(email, token, username) {
    const verificationUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${token}`;
    const info = await transporter.sendMail({
        from: `"IronAds" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Подтверждение регистрации на IronAds',
        text: `Уважаемый(ая) ${username}! Для подтверждения регистрации на сайте IronAds, пожалуйста, перейдите по ссылке: ${verificationUrl} Ссылка действительна 24 часа. Если вы не регистрировались на нашем сайте, просто проигнорируйте это письмо.`,
        // html-версию пока можно убрать, чтобы упростить письмо
    });
    console.log('Verification email sent: %s', info.messageId);
}

module.exports = { sendVerificationEmail };