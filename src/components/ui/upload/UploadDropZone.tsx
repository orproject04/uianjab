import { UploadDropzone } from "@bytescale/upload-widget-react";

const options = {
  apiKey: "public_223k2JY9ppN2KbS7NX8VG8P6frxr",
  maxFileCount: 1,
  showFinishButton: true, // Note: You must use 'onUpdate' if you set 'showFinishButton: false' (default).
  styles: {
    colors: {
      primary: "#5932EA"
    }
  }
};

const MyApp = () => (
  <UploadDropzone options={options}
                  onUpdate={({ uploadedFiles }) => console.log(uploadedFiles.map(x => x.fileUrl).join("\n"))}
                  onComplete={files => alert(files.map(x => x.fileUrl).join("\n"))}
                  width="600px"
                  height="375px" />
)