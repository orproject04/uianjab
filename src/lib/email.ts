import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, html: string) {
    try {
        // Validate SMTP configuration
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.error("SMTP configuration is incomplete");
            throw new Error("SMTP configuration is incomplete");
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: false,
            auth: { 
                user: process.env.SMTP_USER, 
                pass: process.env.SMTP_PASS 
            },
            // Add timeout for better error handling
            connectionTimeout: 10000,
            socketTimeout: 10000,
        });

        // Verify SMTP connection before sending
        await transporter.verify();

        const info = await transporter.sendMail({ 
            from: process.env.EMAIL_FROM || "noreply@anjab.local", 
            to, 
            subject, 
            html 
        });

        console.log("Email sent successfully:", info.messageId);
        return info;
    } catch (error) {
        console.error("Failed to send email:", error);
        throw error;
    }
}
