import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Upload, Download, Plus, Trash2, CheckSquare, Square, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { contactsApi, type Contact } from '../services/api';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { CsvUploader } from '../components/contacts/CsvUploader';
import { ContactForm } from '../components/contacts/ContactForm';
import { useStore } from '../store';

export function Contacts() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const queryClient = useQueryClient();

  const { selectedContactIds, toggleContactSelection, selectContacts, clearContactSelection } =
    useStore();

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { page, search }],
    queryFn: () => contactsApi.list({ page, pageSize: 20, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      toast.success('Contact deleted');
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const contacts = data?.data?.data ?? [];
  const pagination = data?.data?.pagination;

  const handleExport = async () => {
    try {
      const response = await contactsApi.exportCsv();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contacts.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Contacts exported');
    } catch {
      toast.error('Failed to export contacts');
    }
  };

  const handleSelectAll = () => {
    if (selectedContactIds.size === contacts.length) {
      clearContactSelection();
    } else {
      selectContacts(contacts.map((c) => c.id));
    }
  };

  const allSelected = contacts.length > 0 && selectedContactIds.size === contacts.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => setShowImportModal(true)}
          >
            Import CSV
          </Button>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Add Contact
          </Button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        {selectedContactIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {selectedContactIds.size} selected
            </span>
            <Button variant="secondary" size="sm" onClick={clearContactSelection}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Contacts table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3">
                <button
                  onClick={handleSelectAll}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {allSelected ? (
                    <CheckSquare className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                First Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                Last Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                Email
              </th>
              <th className="w-10 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {search ? 'No contacts found matching your search' : 'No contacts yet'}
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className={`hover:bg-gray-50 ${
                    selectedContactIds.has(contact.id) ? 'bg-primary-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleContactSelection(contact.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {selectedContactIds.has(contact.id) ? (
                        <CheckSquare className="h-5 w-5 text-primary-600" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {contact.firstName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {contact.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {contact.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {contact.email || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingContact(contact)}
                        className="text-gray-400 hover:text-primary-600"
                        title="Edit contact"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this contact?')) {
                            deleteMutation.mutate(contact.id);
                          }
                        }}
                        className="text-gray-400 hover:text-red-600"
                        title="Delete contact"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-700">
              Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{' '}
              {pagination.totalItems} contacts
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Contacts"
        size="lg"
      >
        <CsvUploader onSuccess={() => setShowImportModal(false)} />
      </Modal>

      {/* Add Contact Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Contact"
        size="lg"
      >
        <ContactForm
          onSuccess={() => setShowAddModal(false)}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        isOpen={!!editingContact}
        onClose={() => setEditingContact(null)}
        title="Edit Contact"
        size="lg"
      >
        {editingContact && (
          <ContactForm
            contact={editingContact}
            onSuccess={() => setEditingContact(null)}
            onCancel={() => setEditingContact(null)}
          />
        )}
      </Modal>
    </div>
  );
}
