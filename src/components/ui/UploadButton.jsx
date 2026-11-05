import { useRef } from 'react';
import { Upload } from 'lucide-react';
import Button from './Button';

/** A button that opens the file picker and hands the chosen file to onFile. */
export default function UploadButton({ accept, onFile, children = 'Upload file', ...props }) {
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        aria-label={typeof children === 'string' ? children : 'Upload file'}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // the same file can be picked again
          if (file) onFile(file);
        }}
      />
      <Button icon={Upload} variant="secondary" onClick={() => ref.current?.click()} {...props}>
        {children}
      </Button>
    </>
  );
}
