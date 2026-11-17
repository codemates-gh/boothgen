
'use client';
import { Modal as HeroModal, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalHeading, ModalBody, ModalCloseTrigger } from '@heroui/react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <HeroModal>
      <ModalBackdrop
        isOpen={open}
        onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}
        isDismissable
      >
        <ModalContainer>
          <ModalDialog className={cn('max-h-[90vh] overflow-y-auto w-full max-w-lg', className)}>
            {title && (
              <ModalHeader className="border-b px-6 py-4 flex items-center justify-between">
                <ModalHeading className="text-lg font-semibold">{title}</ModalHeading>
                <ModalCloseTrigger className="text-gray-400 hover:text-gray-600" />
              </ModalHeader>
            )}
            <ModalBody className="p-6">{children}</ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </HeroModal>
  );
}
