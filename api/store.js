const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { BlobServiceClient } = require("@azure/storage-blob");

// An application, its invoice, and its activity are one record. Conditional
// blob writes keep a payment and its audit entry together across instances.
class BlobStore {
  constructor(connection) {
    this.container = BlobServiceClient.fromConnectionString(connection).getContainerClient("sponsorship");
  }
  async read(key) {
    try {
      const response = await this.container.getBlobClient(key).download();
      const chunks = [];
      for await (const chunk of response.readableStreamBody) chunks.push(chunk);
      return { value: JSON.parse(Buffer.concat(chunks)), version: response.etag };
    } catch (error) {
      if (error.statusCode === 404 && error.code === "BlobNotFound") return null;
      throw error;
    }
  }
  async write(key, value, version) {
    try {
      await this.container.getBlockBlobClient(key).uploadData(Buffer.from(JSON.stringify(value)), {
        conditions: version ? { ifMatch: version } : { ifNoneMatch: "*" },
        blobHTTPHeaders: { blobContentType: "application/json" }
      });
      return true;
    } catch (error) {
      if (error.statusCode === 412 || error.code === "BlobAlreadyExists") return false;
      throw error;
    }
  }
}

// The local HTTP runner uses one process and persists across restarts.
class LocalStore {
  constructor(directory) {
    this.directory = directory;
    this.writing = Promise.resolve();
  }
  async read(key) {
    try { return JSON.parse(await fs.readFile(path.join(this.directory, key), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  write(key, value, version) {
    const write = this.writing.then(async () => {
      if (((await this.read(key))?.version ?? null) !== (version ?? null)) return false;
      const file = path.join(this.directory, key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = file + "." + randomUUID() + ".tmp";
      await fs.writeFile(temporary, JSON.stringify({ version: randomUUID(), value }));
      await fs.rename(temporary, file);
      return true;
    });
    this.writing = write.catch(() => {});
    return write;
  }
}

module.exports = { BlobStore, LocalStore };

