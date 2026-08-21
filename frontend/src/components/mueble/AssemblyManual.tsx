import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { FileText, Download } from 'lucide-react';
import type { AssemblyResponse } from '../../types';
import { Button } from '../ui/Button';
import { generateAssemblyHtml } from '../../utils/generateAssemblyHtml';

export interface AssemblyManualProps {
  response: AssemblyResponse | null;
  levels?: string[][];
  fileName?: string;
  children?: ReactNode;
}

export function AssemblyManual({
  response,
  levels,
  fileName = 'proyecto',
  children,
}: AssemblyManualProps) {
  const handleDownloadHtml = () => {
    if (!response) {
      toast.error('No hay datos de ensamblaje para exportar');
      return;
    }

    const html = generateAssemblyHtml(response, levels);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manual-ensamblaje-${fileName}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenPdf = () => {
    if (!response) {
      toast.error('No hay datos de ensamblaje');
      return;
    }
    if (response.pdf_path) {
      window.open(response.pdf_path, '_blank');
    } else {
      toast('El PDF se genera en el servidor. Solicítalo desde el panel de ensamblaje.');
    }
  };

  return (
    <div className='inline-flex flex-wrap items-center gap-2'>
      {children}
      <Button
        variant='outline'
        size='sm'
        disabled={!response}
        onClick={handleDownloadHtml}
      >
        <FileText className='mr-1.5 h-4 w-4' />
        Descargar HTML
      </Button>
      <Button
        variant='outline'
        size='sm'
        disabled={!response}
        onClick={handleOpenPdf}
      >
        <Download className='mr-1.5 h-4 w-4' />
        Descargar PDF
      </Button>
    </div>
  );
}
