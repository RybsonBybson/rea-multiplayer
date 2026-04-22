import axios from "axios";
import FormData from "form-data";
import fs from "fs";

export default class FileManager {
  private botToken: string;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  async upload_file(fileBuffer: Buffer, filename: string): Promise<string> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
    const form = new FormData();
    form.append("chat_id", this.chatId);
    form.append("document", fileBuffer, { filename });
    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
    });
    return response.data.result.document.file_id;
  }

  async download_file(fileId: string): Promise<Buffer> {
    const url = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;
    const response = await axios.get(url);
    const filePath = response.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const fileResponse = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
    });
    return Buffer.from(fileResponse.data);
  }
}
