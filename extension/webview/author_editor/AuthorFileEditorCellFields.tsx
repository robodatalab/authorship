import "./AuthorFileEditorCellFields.css";

export interface AuthorFileEditorCellField {
    name: string;
    label: string;
    hint?: string;
    toggle?: boolean;
}

interface AuthorFileEditorCellFieldsProps {
    fields: AuthorFileEditorCellField[];
    attributes: Record<string, string>;
    onAttributeChanged: (name: string, value: string) => void;
}

export function AuthorFileEditorCellFields({
    fields,
    attributes,
    onAttributeChanged,
}: AuthorFileEditorCellFieldsProps) {
    return (
        <div className="author-file-editor-cell-fields">
            {fields.map((field) => (
                <label
                    className="author-file-editor-cell-field"
                    key={field.name}
                >
                    <span className="author-file-editor-cell-field-label">
                        {field.label}
                    </span>
                    {field.toggle ? (
                        <input
                            type="checkbox"
                            checked={attributes[field.name] !== "no"}
                            onChange={(event) =>
                                onAttributeChanged(
                                    field.name,
                                    event.currentTarget.checked ? "yes" : "no",
                                )
                            }
                        />
                    ) : (
                        <input
                            type="text"
                            className="author-file-editor-cell-field-input"
                            value={attributes[field.name] ?? ""}
                            placeholder={field.hint ?? ""}
                            onChange={(event) =>
                                onAttributeChanged(
                                    field.name,
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
