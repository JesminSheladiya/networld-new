import { useState } from "react";
import { Form, Input, Button, Card, message, Typography, Select } from "antd";
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { register } from "../Services/authService";

const { Title } = Typography;

function Register({ onRegisterSuccess, onSwitchForm }) {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const firstName = values.name.trim().split(" ")[0];

      const data = await register(
        firstName,
        values.email,
        values.phone,
        values.password,
        values.name.trim(),
        values.gender
      );
      message.success(`Welcome, ${data.username}! Registration successful.`);
      onRegisterSuccess();
    } catch (error) {
      message.error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Registration failed!"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page" style={{
      display: "flex", justifyContent: "center",
      alignItems: "center", height: "100vh", background: "#141414"
    }}>
      <Card className="register-card"
        style={{
          width: 420,
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
        styles={{ body: { padding: "32px 28px" } }}
      >
        <Title className="register-title" level={2} style={{ textAlign: "center", marginBottom: 24, color: "#f1f5f9" }}>
          Net World Register
        </Title>

        <Form className="register-form" name="register" onFinish={onFinish} autoComplete="off" layout="vertical">

          <Form.Item className="register-field" name="name"
            rules={[
              { required: true, message: "Please enter your full name!" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const words = value.trim().split(/\s+/);
                  if (words.length < 2)
                    return Promise.reject("Please enter at least 2 words (First Last)!");
                  return Promise.resolve();
                }
              }
            ]}>
            <Input className="register-input" prefix={<UserOutlined style={{ color: "#38bdf8" }} />} placeholder="Enter Name" size="large" />
          </Form.Item>

          <Form.Item className="register-field" name="email"
            rules={[
              { required: true, message: "Please enter email!" },
              { type: "email", message: "Please enter a valid email!" }
            ]}>
            <Input className="register-input" prefix={<MailOutlined style={{ color: "#38bdf8" }} />} placeholder="Email" size="large" />
          </Form.Item>

          <Form.Item className="register-field" name="phone"
            rules={[
              { required: true, message: "Please enter phone!" },
              { pattern: /^[0-9]{10}$/, message: "Phone must be 10 digits!" }
            ]}>
            <Input className="register-input" prefix={<PhoneOutlined style={{ color: "#38bdf8" }} />} placeholder="Phone (10 digits)" size="large" />
          </Form.Item>

          <Form.Item className="register-field" name="password"
            rules={[
              { required: true, message: "Please enter password!" },
              { min: 8, message: "Password must be at least 8 characters!" }
            ]}>
            <Input.Password className="register-input" prefix={<LockOutlined style={{ color: "#38bdf8" }} />} placeholder="Password" size="large" />
          </Form.Item>

          <Form.Item className="register-field" name="gender"
            rules={[{ required: true, message: "Please select gender!" }]}>
            <Select
              className="register-input"
              placeholder="Gender"
              size="large"
              options={[
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
              ]}
            />
          </Form.Item>

          <Form.Item className="register-field">
            <Button className="register-btn" type="primary" htmlType="submit"
              loading={loading} block size="large">
              Register
            </Button>
          </Form.Item>
        </Form>

        <div className="register-footer" style={{ textAlign: "center", marginTop: 8 }}>
          <Typography.Text className="register-footer-text" style={{ color: "#94a3b8" }}>
            Already have an account?{" "}
            <a className="register-switch-link" onClick={onSwitchForm} style={{ cursor: "pointer", color: "#38bdf8", fontWeight: 600 }}>
              Login here
            </a>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default Register;