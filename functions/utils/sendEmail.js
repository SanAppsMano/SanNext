import nodemailer from 'nodemailer';

export async function sendOtpEmail(to, code, subject) {
  if (!process.env.SMTP_HOST) {
    console.warn('SMTP not configured');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text: `Seu código de verificação é ${code}`,
  });
}
