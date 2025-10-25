import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "../config/awsConfig.js";
export const getPresignedUrl = async (req, res) => {
  try {
    const { filename, contentType } = req.query;

    if (!filename) {
      return res.status(400).json({ error: "Missing filename parameter" });
    }

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filename,
      ContentType: contentType || "application/pdf",
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 }); // 60s

    return res.status(200).json({ url });
  } catch (error) {
    console.error("Error creating presigned URL:", error);
    res.status(500).json({ error: "Failed to create presigned URL" });
  }
};
