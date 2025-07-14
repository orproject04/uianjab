import Image from "next/image";
import React from "react";

export default function GridShape() {
  return (
    <>
      <div className="absolute right-0 -z-1 w-full h-full max-w-[250px] xl:max-w-[450px]">
        <Image
          width={1000}
          height={500}
          src="/images/shape/pattern.svg"
          alt="grid"
        />
      </div>
      <div className="absolute bottom-0 -z-1 w-full h-full max-w-[250px] rotate-180 xl:max-w-[450px]">
        <Image
          width={1000}
          height={500}
          src="/images/shape/pattern.svg"
          alt="grid"
        />
      </div>
    </>
  );
}
