import axios from "axios";
import FormData from "form-data";
import fs from "fs";

export default class FileManager {
  private botToken: string;
  private chatId: string;
  private requestTimeout = 30000; // 30 seconds

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;

    if (!botToken || !chatId) {
      console.warn("[FileManager] Warning: Telegram credentials not fully configured");
    }
  }

  async upload_file(fileBuffer: Buffer, filename: string): Promise<string> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
      const form = new FormData();
      form.append("chat_id", this.chatId);
      form.append("document", fileBuffer, { filename });

      console.log("[FileManager] Uploading file:", filename, `(${fileBuffer.length} bytes)`);

      const response = await axios.post(url, form, {
        headers: form.getHeaders(),
        timeout: this.requestTimeout,
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }

      const fileId = response.data.result.document.file_id;
      console.log("[FileManager] File uploaded successfully, ID:", fileId);
      return fileId;
    } catch (error: any) {
      const message = error.response?.data?.description || error.message || "Unknown error";
      console.error("[FileManager] Upload error:", message);
      throw new Error(`Upload failed: ${message}`);
    }
  }

  async download_file(fileId: string): Promise<Buffer> {
    try {
      console.log("[FileManager] Downloading file with ID:", fileId);

      const url = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;

      const response = await axios.get(url, {
        timeout: this.requestTimeout,
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }

      const filePath = response.data.result.file_path;
      if (!filePath) {
        throw new Error("No file path returned from Telegram API");
      }

      const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;

      const fileResponse = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: this.requestTimeout,
      });

      const buffer = Buffer.from(fileResponse.data);
      console.log("[FileManager] File downloaded successfully:", filePath, `(${buffer.length} bytes)`);
      return buffer;
    } catch (error: any) {
      const message = error.response?.data?.description || error.message || "Unknown error";
      console.error("[FileManager] Download error:", message);
      throw new Error(`Download failed: ${message}`);
    }
  }
}
