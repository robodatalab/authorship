import { useState } from "react";
import "./AuthorFileEditorCellFields.css";

export interface AuthorFileEditorCellField {
    label: string;
    said: string;
    placeholder?: string;
    onSaid: (said: string) => void;
}

export interface AuthorFileEditorCellCheckbox {
    label: string;
    isChecked: boolean;
    onChecked: (isChecked: boolean) => void;
}

interface AuthorFileEditorCellFieldsProps {
    fields: AuthorFileEditorCellField[];
    checkboxes?: AuthorFileEditorCellCheckbox[];
}

export function AuthorFileEditorCellFields({
    fields,
    checkboxes = [],
}: AuthorFileEditorCellFieldsProps) {
    return (
        <div className="author-file-editor-cell-fields">
            {fields.map((field) => (
                <label className="author-file-editor-cell-field" key={field.label}>
                    <span className="author-file-editor-cell-field-label">
                        {field.label}
                    </span>
                    <AuthorFileEditorCellFieldBox
                        className="author-file-editor-cell-field-input"
                        said={field.said}
                        placeholder={field.placeholder ?? ""}
                        onSaid={field.onSaid}
                    />
                </label>
            ))}
            {checkboxes.map((checkbox) => (
                <label
                    className="author-file-editor-cell-field"
                    key={checkbox.label}
                >
                    <span className="author-file-editor-cell-field-label">
                        {checkbox.label}
                    </span>
                    <input
                        type="checkbox"
                        checked={checkbox.isChecked}
                        onChange={(event) =>
                            checkbox.onChecked(event.currentTarget.checked)
                        }
                    />
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
