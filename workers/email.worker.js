import nodemailer from "nodemailer";
import { initRabbitMQ, consumeFromQueue } from "../config/rabbitmq.config.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

// Corrected: Added '=' and 'async'
export const startWorker = async () => {
  // 1. Establish RabbitMQ connection
  await initRabbitMQ();

  // 2. Start consuming the queue
  await consumeFromQueue("otp-email-queue", async (data) => {
    const { email, otp } = data;

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Your OTP for Password Reset",
      html: `<h2>Your OTP is ${otp}</h2><p>This code expires in 15 minutes.</p>`,
    };

    // The worker blocks here while waiting for Gmail, keeping your Express API free
    await transporter.sendMail(mailOptions);
    console.log(`🟢 Successfully sent OTP email to ${email}`);
  });
};
