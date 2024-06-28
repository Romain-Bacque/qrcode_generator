require("dotenv").config();
const express = require("express");

const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob"); // This line imports specific modules from the @azure/storage-blob package, which is the Azure Blob Storage SDK for JavaScript. It allows you to interact with Azure Blob Storage from our Node.js application.
const qrcode = require("qrcode"); // This line imports the qrcode module, which is a popular Node.js library for generating QR codes.
const { v4: uuidv4 } = require("uuid"); // This line imports the uuid module and specifically extracts the v4 function as uuidv4. The uuid module is used to generate universally unique identifiers (UUIDs) in Node.js.
const { Readable } = require("stream"); // This line imports the Readable class from the built-in Node.js stream module. The Readable class is used to create readable streams, which are useful for handling data that can be read sequentially.

const app = express();
const port = process.env.PORT || 3000;

// Allowing CORS for local testing
const origins = ["http://localhost:3000"];

app.use((_, res, next) => {
  res.header("Access-Control-Allow-Origin", origins.join(",")); // update to match the domain you will make the request from (join with comma if multiple origins are allowed)
  // The "Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept" line ensures that your Express.js server includes these headers in its CORS policy, allowing requests from specified origins (http://localhost:3000 in this case) and permitting specified headers to be sent in requests. This setup facilitates communication between your frontend and backend during development.
  res.header(
    "Access-Control-Allow-Headers", // allow headers to be passed from the client to the server
    "Origin, X-Requested-With, Content-Type, Accept" // list of allowed headers (X-Requested-With : en-tête HTTP facultatif utilisé principalement pour identifier les requêtes AJAX, permettant ainsi aux serveurs de distinguer les requêtes asynchrones des requêtes de navigation traditionnelles et d'adapter leur comportement en conséquence.)
  );
  next();
});

const containerName = process.env.CONTAINER_NAME;

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
); // This line creates a new BlobServiceClient object using the fromConnectionString method from the Azure Blob Storage SDK. The fromConnectionString method takes the connection string from the AZURE_STORAGE_CONNECTION_STRING environment variable as an argument.

app.use(express.json()); // This line tells the Express.js server to parse JSON data in the request body.

app.post("/generate-qr", async (req, res) => {
  const { url } = req.body; // This line extracts the URL from the request body.

  console.log("URL received: ", url);
  
  const qrCode = await qrcode.toBuffer(url); // This line generates a QR code image from the URL using the qrcode module and stores it in the qrCode variable.

  const bufferStream = new Readable(); // This line creates a new Readable stream using the Readable class from the Node.js stream module (a Readable stream is an abstraction for a source from which data can be consumed). This stream will be used to store the QR code image data.

  bufferStream.push(qrCode); // This line pushes the QR code image data into the bufferStream.
  bufferStream.push(null); // This line signals the end of the stream by pushing a null value into the bufferStream.

  // Generate unique file name for Azure Blob Storage
  const fileName = `qr_codes/${uuidv4()}.png`; // This line generates a unique file name for the QR code image by combining the qr_codes/ prefix with a UUID (generated using the uuid module) and the .png extension.

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName); // This line creates a new ContainerClient object using the getContainerClient method from the BlobServiceClient object. The getContainerClient method takes the containerName variable (which contains the name of the Azure Blob Storage container) as an argument.
    const blockBlobClient = containerClient.getBlockBlobClient(fileName); // This line creates a new BlockBlobClient object using the getBlockBlobClient method from the ContainerClient object. The getBlockBlobClient method takes the fileName variable (which contains the unique file name for the QR code image) as an argument.

    // Upload QR code image to Azure Blob Storage
    await blockBlobClient.uploadStream(bufferStream, 4 * 1024 * 1024, 20, {
      // 4 * 1024 * 1024 = 4MB, 20 = max number of parallel requests
      blobHTTPHeaders: {
        blobContentType: "image/png",
      },
    });

    // Generate SAS token for blob
    const sasToken = generateSasToken(blockBlobClient);

    // Generate the Blob URL with SAS token
    const blobUrlWithSasToken = `${blockBlobClient.url}?${sasToken}`;

    // Send response with the Blob URL containing SAS token
    res.json({ qr_code_url: blobUrlWithSasToken });
  } catch (error) {
    console.error("Error generating QR Code:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Function to generate SAS token for blob
function generateSasToken(blobClient) {
  const blobSAS = generateBlobSASQueryParameters(
    {
      containerName: blobClient.containerName, // Name of the container
      blobName: blobClient.blobName, // Name of the blob
      permissions: BlobSASPermissions.parse("r"), // Read permission (r = read, w = write, d = delete, l = list)
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 86400), // Token expires in 24 hours
    },
    blobClient.credential // StorageSharedKeyCredential - contains storage account name and key
  );

  return blobSAS.toString();
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
