import "./AuthorFileEditorCellFields.css";

export interface AuthorFileEditorCellField {
    attributeName: string;
    label: string;
    placeholder?: string;
    isCheckbox?: boolean;
}

interface AuthorFileEditorCellFieldsProps {
    fields: AuthorFileEditorCellField[];
    cellAttributes: Record<string, string>;
    onAttributeChanged: (attributeName: string, attributeValue: string) => void;
}

export function AuthorFileEditorCellFields({
    fields,
    cellAttributes,
    onAttributeChanged,
}: AuthorFileEditorCellFieldsProps) {
    return (
        <div className="author-file-editor-cell-fields">
            {fields.map((field) => (
                <label
                    className="author-file-editor-cell-field"
                    key={field.attributeName}
                >
                    <span className="author-file-editor-cell-field-label">
                        {field.label}
                    </span>
                    {field.isCheckbox ? (
                        <input
                            type="checkbox"
                            checked={
                                cellAttributes[field.attributeName] !== "no"
                            }
                            onChange={(event) =>
                                onAttributeChanged(
                                    field.attributeName,
                                    event.currentTarget.checked ? "yes" : "no",
                                )
                            }
                        />
                    ) : (
                        <input
                            type="text"
                            className="author-file-editor-cell-field-input"
                            value={cellAttributes[field.attributeName] ?? ""}
                            placeholder={field.placeholder ?? ""}
                            onChange={(event) =>
                                onAttributeChanged(
                                    field.attributeName,
                                    event.currentTarget.value,
                                )
                            }
                        />
                    )}
                </label>
            ))}
        </div>
    );
}
