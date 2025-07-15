'use client';

import { lazy, Suspense, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  MRT_EditActionButtons,
  MaterialReactTable,
  // createRow,
  type MRT_ColumnDef,
  type MRT_Row,
  type MRT_TableOptions,
  useMaterialReactTable,
} from 'material-react-table';
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type Document, fakeData} from './makeData';
import { BiEditAlt } from "react-icons/bi";
import { AiFillDelete } from "react-icons/ai";
import UploadZone from '@/components/ui/upload/UploadZone';

const Example = () => {
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string | undefined>
  >({});

  const columns = useMemo<MRT_ColumnDef<Document>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Id',
        enableEditing: false,
        size: 80,
      },
      {
        accessorKey: 'documentName',
        header: 'Document Name',
        muiEditTextFieldProps: {
          required: true,
          error: !!validationErrors?.documentName,
          helperText: validationErrors?.documentName,
          //remove any previous validation errors when user focuses on the input
          onFocus: () =>
            setValidationErrors({
              ...validationErrors,
              documentName: undefined,
            }),
          //optionally add validation checking for onBlur or onChange
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        muiEditTextFieldProps: {
          required: true,
          error: !!validationErrors?.createdAt,
          helperText: validationErrors?.createdAt,
          //remove any previous validation errors when user focuses on the input
          onFocus: () =>
            setValidationErrors({
              ...validationErrors,
              createdAt: undefined,
            }),
        },
      },
      {
        accessorKey: 'documentType',
        header: 'Document Type',
        muiEditTextFieldProps: {
          required: true,
          error: !!validationErrors?.documentType,
          helperText: validationErrors?.documentType,
          //remove any previous validation errors when user focuses on the input
          onFocus: () =>
            setValidationErrors({
              ...validationErrors,
              documentType: undefined,
            }),
        },
      },
    ],
    [validationErrors],
  );

  //call CREATE hook
  const { mutateAsync: createDocument, isPending: isUploadingDocument } =
    useUploadDocument();
  //call READ hook
  const {
    data: fetchedDocuments = [],
    isError: isLoadingDocumentsError,
    isFetching: isFetchingDocuments,
    isLoading: isLoadingDocuments,
  } = useGetDocuments();
  //call UPDATE hook
  const { mutateAsync: updateDocument, isPending: isUpdatingDocument } =
    useUpdateDocument();
  //call DELETE hook
  const { mutateAsync: deleteDocument, isPending: isDeletingDocument } =
    useDeleteDocument();

  //CREATE action
  const handleUploadDocument: MRT_TableOptions<Document>['onCreatingRowSave'] = async ({
    values,
    table,
  }) => {
    const newValidationErrors = validateDocument(values);
    if (Object.values(newValidationErrors).some((error) => error)) {
      setValidationErrors(newValidationErrors);
      return;
    }
    setValidationErrors({});
    await createDocument(values);
    table.setCreatingRow(null); //exit creating mode
  };

  //UPDATE action
  const handleSaveDocument: MRT_TableOptions<Document>['onEditingRowSave'] = async ({
    values,
    table,
  }) => {
    const newValidationErrors = validateDocument(values);
    if (Object.values(newValidationErrors).some((error) => error)) {
      setValidationErrors(newValidationErrors);
      return;
    }
    setValidationErrors({});
    await updateDocument(values);
    table.setEditingRow(null); //exit editing mode
  };

  //DELETE action
  const openDeleteConfirmModal = (row: MRT_Row<Document>) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      deleteDocument(row.original.id);
    }
  };

  const table = useMaterialReactTable({
    columns,
    data: fetchedDocuments,
    createDisplayMode: 'modal', //default ('row', and 'custom' are also available)
    editDisplayMode: 'modal', //default ('row', 'cell', 'table', and 'custom' are also available)
    enableEditing: true,
    getRowId: (row) => row.id,
    muiToolbarAlertBannerProps: isLoadingDocumentsError
      ? {
          color: 'error',
          children: 'Error loading data',
        }
      : undefined,
    muiTableContainerProps: {
      sx: {
        minHeight: '500px',
      },
    },
    onCreatingRowCancel: () => setValidationErrors({}),
    onCreatingRowSave: handleUploadDocument,
    onEditingRowCancel: () => setValidationErrors({}),
    onEditingRowSave: handleSaveDocument,
    //optionally customize modal content
    renderCreateRowDialogContent: ({ table, row, internalEditComponents }) => (
      <>
        <DialogTitle variant="h3">Create New Document</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {internalEditComponents} {/* or render custom edit components here */}
        </DialogContent>
        <DialogActions>
          <MRT_EditActionButtons variant="text" table={table} row={row} />
        </DialogActions>
      </>
    ),
    //optionally customize modal content
    renderEditRowDialogContent: ({ table, row, internalEditComponents }) => (
      <>
        <DialogTitle variant="h3">Edit Document</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          {internalEditComponents} {/* or render custom edit components here */}
        </DialogContent>
        <DialogActions>
          <MRT_EditActionButtons variant="text" table={table} row={row} />
        </DialogActions>
      </>
    ),
    renderRowActions: ({ row, table }) => (
      <Box sx={{ display: 'flex', gap: '1rem' }}>
        <Tooltip title="Edit">
          <IconButton onClick={() => table.setEditingRow(row)}>
            <BiEditAlt size={20} color="black" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton color="error" onClick={() => openDeleteConfirmModal(row)}>
            <AiFillDelete size={20} />
          </IconButton>
        </Tooltip>
      </Box>
    ),
    renderTopToolbarCustomActions: ({ table }) => (
      <Button
        variant="contained"
        onClick={() => {
          table.setCreatingRow(true); //simplest way to open the create row modal with no default values
          //or you can pass in a row object to set default values with the `createRow` helper function
          // table.setCreatingRow(
          //   createRow(table, {
          //     //optionally pass in default values for the new row, useful for nested data or other complex scenarios
          //   }),
          // );
        }}
      >
        Upload Document
      </Button>
    ),
    state: {
      isLoading: isLoadingDocuments,
      isSaving: isUploadingDocument || isUpdatingDocument || isDeletingDocument,
      showAlertBanner: isLoadingDocumentsError,
      showProgressBars: isFetchingDocuments,
    },
  });

  return <MaterialReactTable table={table} />;
};

//CREATE hook (post new document to api)
function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (document: Document) => {
      //send api update request here
      await new Promise((resolve) => setTimeout(resolve, 1000)); //fake api call
      return Promise.resolve();
    },
    //client side optimistic update
    onMutate: (newDocumentInfo: Document) => {
      queryClient.setQueryData(
        ['documents'],
        (prevDocuments: Document[] | undefined) => {
          // Add null check and default to empty array
          const documents = prevDocuments || [];
          return [
            ...documents,
            {
              ...newDocumentInfo,
              id: (Math.random() + 1).toString(36).substring(7),
            },
          ] as Document[];
        },
      );
    },
    // onSettled: () => queryClient.invalidateQueries({ queryKey: ['documents'] }), //refetch documents after mutation, disabled for demo
  });
}

//READ hook (get documents from api)
function useGetDocuments() {
  return useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      //send api request here
      await new Promise((resolve) => setTimeout(resolve, 1000)); //fake api call
      return Promise.resolve(fakeData);
    },
    refetchOnWindowFocus: false,
  });
}

//UPDATE hook (put document in api)
function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (document: Document) => {
      //send api update request here
      await new Promise((resolve) => setTimeout(resolve, 1000)); //fake api call
      return Promise.resolve();
    },
    //client side optimistic update
    onMutate: (newDocumentInfo: Document) => {
      queryClient.setQueryData(['documents'], (prevDocuments: Document[] | undefined) => {
        // Add null check and default to empty array
        const documents = prevDocuments || [];
        return documents.map((prevDocument: Document) =>
          prevDocument.id === newDocumentInfo.id ? newDocumentInfo : prevDocument,
        );
      });
    },
    // onSettled: () => queryClient.invalidateQueries({ queryKey: ['documents'] }), //refetch documents after mutation, disabled for demo
  });
}

//DELETE hook (delete document in api)
function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      //send api update request here
      await new Promise((resolve) => setTimeout(resolve, 1000)); //fake api call
      return Promise.resolve();
    },
    //client side optimistic update
    onMutate: (documentId: string) => {
      queryClient.setQueryData(['documents'], (prevDocuments: Document[] | undefined) => {
        // Add null check and default to empty array
        const documents = prevDocuments || [];
        return documents.filter((document: Document) => document.id !== documentId);
      });
    },
    // onSettled: () => queryClient.invalidateQueries({ queryKey: ['documents'] }), //refetch documents after mutation, disabled for demo
  });
}

//react query setup
const ReactQueryDevtoolsProduction = lazy(() =>
  import('@tanstack/react-query-devtools/build/modern/production.js').then(
    (d) => ({
      default: d.ReactQueryDevtools,
    }),
  ),
);

const queryClient = new QueryClient();

export default function DocumentTable() {
  return (
    <QueryClientProvider client={queryClient}>
      <UploadZone />
      <Example />
      <Suspense fallback={null}>
        <ReactQueryDevtoolsProduction />
      </Suspense>
    </QueryClientProvider>
  );
}

const validateRequired = (value: string) => !!value.length;

function validateDocument(document: Document) {
  return {
    documentName: !validateRequired(document.documentName)
      ? 'Document Name is Required'
      : '',
    documentType: !validateRequired(document.documentType)
      ? 'Document Type is Required'
      : '',
    createdAt: !validateRequired(document.createdAt)
      ? 'Created At is Required'
      : '',
  };
}