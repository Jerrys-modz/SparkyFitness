import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ShoppingListItem } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useAddShoppingListItemMutation,
  useClearCheckedShoppingListMutation,
  useDeleteShoppingListItemMutation,
  useShoppingList,
  useToggleShoppingListItemMutation,
  useUpdateShoppingListItemMutation,
} from '@/hooks/ShoppingList/useShoppingList';

/** Turns the text of a quantity field into a positive number, or null when blank or invalid. */
const parseQuantity = (value: string): number | null => {
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
};

const describeAmount = (item: ShoppingListItem): string =>
  [item.quantity, item.unit]
    .filter((part) => part !== null && part !== '')
    .join(' ');

const EditItemDialog: React.FC<{
  item: ShoppingListItem | null;
  onClose: () => void;
}> = ({ item, onClose }) => {
  const { t } = useTranslation();
  const update = useUpdateShoppingListItemMutation();
  const [name, setName] = useState(item?.name ?? '');
  const [quantity, setQuantity] = useState(
    item?.quantity != null ? String(item.quantity) : ''
  );
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [note, setNote] = useState(item?.note ?? '');

  const canSave = name.trim() !== '' && !update.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!item || !canSave) return;
    update.mutate(
      {
        id: item.id,
        body: {
          name: name.trim(),
          quantity: parseQuantity(quantity),
          unit: unit.trim() === '' ? null : unit.trim(),
          note: note.trim() === '' ? null : note.trim(),
        },
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shoppingList.editItem', 'Edit item')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="shopping-edit-name">
              {t('shoppingList.name', 'Item')}
            </Label>
            <Input
              id="shopping-edit-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="shopping-edit-quantity">
                {t('shoppingList.quantity', 'Quantity')}
              </Label>
              <Input
                id="shopping-edit-quantity"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shopping-edit-unit">
                {t('shoppingList.unit', 'Unit')}
              </Label>
              <Input
                id="shopping-edit-unit"
                value={unit}
                maxLength={50}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="shopping-edit-note">
              {t('shoppingList.note', 'Note')}
            </Label>
            <Input
              id="shopping-edit-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ItemRow: React.FC<{
  item: ShoppingListItem;
  onToggle: (item: ShoppingListItem, checked: boolean) => void;
  onEdit: (item: ShoppingListItem) => void;
  onDelete: (item: ShoppingListItem) => void;
}> = ({ item, onToggle, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const amount = describeAmount(item);
  return (
    <li className="flex items-center gap-3 py-2">
      <Checkbox
        checked={item.is_checked}
        onCheckedChange={(checked) => onToggle(item, checked === true)}
        aria-label={t('shoppingList.toggle', 'Mark {{name}} as bought', {
          name: item.name,
        })}
      />
      <div className="min-w-0 flex-1">
        <p
          className={
            item.is_checked
              ? 'truncate line-through text-muted-foreground'
              : 'truncate'
          }
        >
          {item.name}
          {amount && (
            <span className="ml-2 text-sm text-muted-foreground">{amount}</span>
          )}
        </p>
        {item.note && (
          <p className="truncate text-xs text-muted-foreground">{item.note}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(item)}
        aria-label={t('shoppingList.edit', 'Edit {{name}}', {
          name: item.name,
        })}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(item)}
        aria-label={t('shoppingList.remove', 'Remove {{name}}', {
          name: item.name,
        })}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
};

const ShoppingList: React.FC = () => {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const { data: items, isLoading } = useShoppingList(!isActingOnBehalf);
  const addItem = useAddShoppingListItemMutation();
  const toggleItem = useToggleShoppingListItemMutation();
  const deleteItem = useDeleteShoppingListItemMutation();
  const clearChecked = useClearCheckedShoppingListMutation();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [editing, setEditing] = useState<ShoppingListItem | null>(null);
  const [checkedOpen, setCheckedOpen] = useState(true);

  const unchecked = (items ?? []).filter((item) => !item.is_checked);
  const checked = (items ?? []).filter((item) => item.is_checked);

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || addItem.isPending) return;
    const parsedQuantity = parseQuantity(quantity);
    addItem.mutate(
      {
        name: trimmed,
        ...(parsedQuantity !== null ? { quantity: parsedQuantity } : {}),
        ...(unit.trim() !== '' ? { unit: unit.trim() } : {}),
      },
      {
        onSuccess: () => {
          setName('');
          setQuantity('');
          setUnit('');
        },
      }
    );
  };

  const handleToggle = (item: ShoppingListItem, isChecked: boolean) =>
    toggleItem.mutate({ id: item.id, isChecked });

  const renderRows = (rows: ShoppingListItem[]) => (
    <ul className="divide-y">
      {rows.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onToggle={handleToggle}
          onEdit={setEditing}
          onDelete={(target) => deleteItem.mutate(target.id)}
        />
      ))}
    </ul>
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">
          {t('shoppingList.title', 'Shopping List')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'shoppingList.subtitle',
            'Keep track of what you need to buy. Only you can see this list.'
          )}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={handleAdd}
            className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2 max-sm:grid-cols-2"
          >
            <div className="space-y-1 max-sm:col-span-2">
              <Label htmlFor="shopping-add-name">
                {t('shoppingList.name', 'Item')}
              </Label>
              <Input
                id="shopping-add-name"
                value={name}
                maxLength={200}
                placeholder={t('shoppingList.namePlaceholder', 'Add an item')}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shopping-add-quantity">
                {t('shoppingList.quantity', 'Quantity')}
              </Label>
              <Input
                id="shopping-add-quantity"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shopping-add-unit">
                {t('shoppingList.unit', 'Unit')}
              </Label>
              <Input
                id="shopping-add-unit"
                value={unit}
                maxLength={50}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={name.trim() === '' || addItem.isPending}
              className="max-sm:col-span-2"
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('shoppingList.add', 'Add')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isActingOnBehalf ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'shoppingList.ownerOnly',
            'The shopping list is private to its owner.'
          )}
        </p>
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (items ?? []).length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('shoppingList.emptyTitle', 'Your list is empty')}
            </CardTitle>
            <CardDescription>
              {t(
                'shoppingList.emptyDescription',
                'Add the things you need to buy and tick them off as you shop.'
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {unchecked.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                {renderRows(unchecked)}
              </CardContent>
            </Card>
          )}

          {checked.length > 0 && (
            <Card>
              <Collapsible open={checkedOpen} onOpenChange={setCheckedOpen}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="px-2">
                      {checkedOpen ? (
                        <ChevronDown className="mr-1 h-4 w-4" />
                      ) : (
                        <ChevronRight className="mr-1 h-4 w-4" />
                      )}
                      {t('shoppingList.checkedSection', 'Bought ({{count}})', {
                        count: checked.length,
                      })}
                    </Button>
                  </CollapsibleTrigger>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearChecked.isPending}
                    onClick={() => clearChecked.mutate()}
                  >
                    {t('shoppingList.clearChecked', 'Clear bought items')}
                  </Button>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>{renderRows(checked)}</CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </>
      )}

      {editing && (
        <EditItemDialog
          key={editing.id}
          item={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default ShoppingList;
