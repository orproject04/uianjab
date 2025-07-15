import React from 'react';
import { UploadDropzone } from "@bytescale/upload-widget-react";
import * as Bytescale from "@bytescale/sdk";

const { useState, useEffect } = React

const options = {
  apiKey: "free",
  
  maxFileCount: 1,

  showFinishButton: true,
  
  styles: {
    colors: {
      primary: "#5932EA"
    },
    fontSizes: {
      "base": 12,
    }
  }
}

// --------------------
// Create a dropzone...
// --------------------

interface MyDropzoneProps {
  setFiles: (files: any) => void; // You can replace 'any' with a more specific type if known
}

const MyDropzone: React.FC<MyDropzoneProps> = ({ setFiles }) => 
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
    <UploadDropzone
      options={options}
      onUpdate={({ uploadedFiles }) =>
        console.log(`Files: ${uploadedFiles.map(x => x.fileUrl).join("\n")}`)
      }
      onComplete={setFiles}
      width="700px"
      height="275px"
    />
  </div>

// -----------------------------
// Display the uploaded files...
// -----------------------------

interface UploadedFile {
  filePath: string;
  accountId: string;
  // Add other properties if needed
}

const MyUploadedFiles = ({files}: { files: UploadedFile[] }) => files.map(file => {
  // Save 'filePath' to your DB, and construct URLs using UrlBuilder:
  const { filePath, accountId } = file;
  // Build an image transformation URL for the uploaded file. 
  // Remove 'options' to get the URL to the original file:
  const fileUrl = Bytescale.UrlBuilder.url({ 
    filePath, 
    accountId, 
    options: { 
      transformation: "preset", 
      transformationPreset: "thumbnail"
    }
  });
  return (
    <p key={fileUrl}>
      <a href={fileUrl} target="_blank">{fileUrl}</a>
    </p>
  );
})

// ----------------------
// Run the application...
// ----------------------

const UploadZone = () => {
  const [files, setFiles] = useState([])
  return (
    <>
      {files.length 
         ? <MyUploadedFiles files={files} /> 
         : <MyDropzone setFiles={setFiles} />
      }
    </>
  );
}

export default UploadZone;