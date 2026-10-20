import { useState } from "react";
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
                        <AuthorFileEditorCellFieldBox
                            className="author-file-editor-cell-field-input"
                            said={cellAttributes[field.attributeName] ?? ""}
                            placeholder={field.placeholder ?? ""}
                            onSaid={(said) =>
                                onAttributeChanged(field.attributeName, said)
                            }
                        />
                    )}
                </label>
            ))}
        </div>
    );
}

interface AuthorFileEditorCellFieldBoxProps {
    className: string;
    said: string;
    placeholder: string;
    onSaid: (said: string) => void;
}

function AuthorFileEditorCellFieldBox({
    className,
    said,
    placeholder,
    onSaid,
}: AuthorFileEditorCellFieldBoxProps) {
    const [beingTyped, setBeingTyped] = useState<string | null>(null);

    return (
        <input
            type="text"
            className={className}
            value={beingTyped ?? said}
            placeholder={placeholder}
            onFocus={() => setBeingTyped(said)}
            onBlur={() => setBeingTyped(null)}
            onChange={(event) => {
                setBeingTyped(event.currentTarget.value);
                onSaid(event.currentTarget.value);
            }}
        />
    );
}
